import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { NoticeType, NotificationChannel, Role, Lease, Prisma } from "@prisma/client";

export const noticesRouter = router({
  // Send a notice (Landlord only) - in-app only for now
  send: authedProcedure
    .input(
      z.object({
        targetType: z.enum(["unit", "property", "all"]),
        targetId: z.string().uuid().optional(),
        title: z.string().min(1),
        body: z.string().min(1),
        type: z.nativeEnum(NoticeType),
        channels: z.array(z.nativeEnum(NotificationChannel)).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== Role.landlord) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only landlords can send notices.",
        });
      }

      if (input.targetType !== "all" && !input.targetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target ID is required when not sending to all properties.",
        });
      }

      const now = new Date();
      let activeLeases: Lease[] = [];

      if (input.targetType === "unit" && input.targetId) {
        const unit = await prisma.unit.findFirst({
          where: { id: input.targetId, deletedAt: null, property: { deletedAt: null } },
          include: { property: true },
        });
        if (!unit || unit.property.landlordId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not own this unit's property.",
          });
        }

        activeLeases = await prisma.lease.findMany({
          where: {
            unitId: input.targetId,
            terminatedAt: null,
            startDate: { lte: now },
            endDate: { gte: now },
          },
        });
      } else if (input.targetType === "property" && input.targetId) {
        const property = await prisma.property.findFirst({
          where: { id: input.targetId, deletedAt: null },
        });
        if (!property || property.landlordId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not own this property.",
          });
        }

        activeLeases = await prisma.lease.findMany({
          where: {
            unit: { propertyId: input.targetId, deletedAt: null },
            terminatedAt: null,
            startDate: { lte: now },
            endDate: { gte: now },
          },
        });
      } else {
        // targetType === "all"
        activeLeases = await prisma.lease.findMany({
          where: {
            unit: {
              deletedAt: null,
              property: { landlordId: ctx.user.id, deletedAt: null },
            },
            terminatedAt: null,
            startDate: { lte: now },
            endDate: { gte: now },
          },
        });
      }

      // Decision: announcements are in-app only for now.
      // Email (Resend) only reaches the account owner's address until a domain is verified.
      // WHERE TO TURN EMAIL BACK ON:
      // To re-enable email dispatching for announcements once a domain is verified,
      // change `channels` to include `NotificationChannel.email`, and restore the
      // `dispatchNotification` call loop below.
      const channels = [NotificationChannel.in_app];

      // Create the parent Notice record
      const notice = await prisma.notice.create({
        data: {
          landlordId: ctx.user.id,
          propertyId: input.targetType === "property" ? input.targetId : null,
          unitId: input.targetType === "unit" ? input.targetId : null,
          title: input.title,
          body: input.body,
          type: input.type,
          channels,
        },
      });

      // Extract unique active tenant IDs
      const tenantIds = Array.from(new Set(activeLeases.map((l) => l.tenantId)));

      if (tenantIds.length > 0) {
        const recipientsData = tenantIds.map((tenantId) => ({
          noticeId: notice.id,
          tenantId,
          inAppDeliveredAt: new Date(),
          emailStatus: null,
        }));

        await prisma.noticeRecipient.createMany({
          data: recipientsData,
        });

        // NOTE: Email dispatch for notices is currently paused (in-app only).
        // To turn email back on, restore the dispatchNotification loop with NotificationChannel.email here.
      }

      return {
        notice,
        recipientCount: tenantIds.length,
      };
    }),

  // List sent notices (Landlord only) with search, filter, and pagination
  listSent: authedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        propertyId: z.string().uuid().optional(),
        category: z.nativeEnum(NoticeType).optional(),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(1).max(100).optional().default(20),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== Role.landlord) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only landlords can view sent notices.",
        });
      }

      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const searchTrimmed = input?.search?.trim();

      const where: Prisma.NoticeWhereInput = {
        landlordId: ctx.user.id,
        ...(input?.category ? { type: input.category } : {}),
        ...(input?.propertyId
          ? {
              OR: [
                { propertyId: input.propertyId, property: { deletedAt: null } },
                { unit: { propertyId: input.propertyId, deletedAt: null, property: { deletedAt: null } } },
              ],
            }
          : {
              AND: [
                {
                  OR: [
                    { propertyId: null },
                    { property: { deletedAt: null } },
                  ],
                },
                {
                  OR: [
                    { unitId: null },
                    { unit: { deletedAt: null, property: { deletedAt: null } } },
                  ],
                },
              ],
            }),
        ...(searchTrimmed
          ? {
              OR: [
                { title: { contains: searchTrimmed, mode: "insensitive" } },
                { body: { contains: searchTrimmed, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [total, notices, totalLandlordProperties] = await Promise.all([
        prisma.notice.count({ where }),
        prisma.notice.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            property: { select: { id: true, name: true } },
            unit: {
              select: {
                id: true,
                unitNumber: true,
                property: { select: { id: true, name: true } },
              },
            },
            recipients: {
              select: {
                id: true,
                readAt: true,
                tenant: { select: { id: true, fullName: true, email: true } },
              },
            },
          },
        }),
        prisma.property.count({ where: { landlordId: ctx.user.id, deletedAt: null } }),
      ]);

      return {
        rows: notices,
        total,
        totalProperties: totalLandlordProperties,
      };
    }),

  // List received notices (Tenant only)
  listReceived: authedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== Role.tenant) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only tenants can view received notices.",
      });
    }

    return await prisma.noticeRecipient.findMany({
      where: { tenantId: ctx.user.id },
      orderBy: { notice: { createdAt: "desc" } },
      include: {
        notice: {
          include: {
            landlord: { select: { fullName: true, avatarUrl: true } },
          },
        },
      },
    });
  }),

  // Mark a received notice as read
  markRead: authedProcedure
    .input(z.object({ recipientId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const recipient = await prisma.noticeRecipient.findUnique({
        where: { id: input.recipientId },
      });

      if (!recipient) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notice recipient log not found.",
        });
      }

      if (recipient.tenantId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to mark this notice as read.",
        });
      }

      return await prisma.noticeRecipient.update({
        where: { id: input.recipientId },
        data: { readAt: new Date() },
      });
    }),
});
