import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { NoticeType, NotificationChannel, Role, Lease, RelatedType, DeliveryStatus } from "@prisma/client";
import { dispatchNotification } from "../services/notificationDispatcher";

export const noticesRouter = router({
  // Send a notice (Landlord only)
  send: authedProcedure
    .input(
      z.object({
        targetType: z.enum(["unit", "property", "all"]),
        targetId: z.string().uuid().optional(),
        title: z.string().min(1),
        body: z.string().min(1),
        type: z.nativeEnum(NoticeType),
        channels: z.array(z.nativeEnum(NotificationChannel)).min(1),
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
        const unit = await prisma.unit.findUnique({
          where: { id: input.targetId },
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
        const property = await prisma.property.findUnique({
          where: { id: input.targetId },
        });
        if (!property || property.landlordId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not own this property.",
          });
        }

        activeLeases = await prisma.lease.findMany({
          where: {
            unit: { propertyId: input.targetId },
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
              property: { landlordId: ctx.user.id },
            },
            terminatedAt: null,
            startDate: { lte: now },
            endDate: { gte: now },
          },
        });
      }

      // Create the parent Notice record
      const notice = await prisma.notice.create({
        data: {
          landlordId: ctx.user.id,
          propertyId: input.targetType === "property" ? input.targetId : null,
          unitId: input.targetType === "unit" ? input.targetId : null,
          title: input.title,
          body: input.body,
          type: input.type,
          channels: input.channels,
        },
      });

      // Extract unique active tenant IDs
      const tenantIds = Array.from(new Set(activeLeases.map((l) => l.tenantId)));

      if (tenantIds.length > 0) {
        const recipientsData = tenantIds.map((tenantId) => ({
          noticeId: notice.id,
          tenantId,
          inAppDeliveredAt: new Date(),
          emailStatus: input.channels.includes(NotificationChannel.email) ? ("pending" as const) : null,
          whatsappStatus: input.channels.includes(NotificationChannel.whatsapp) ? ("pending" as const) : null,
        }));

        await prisma.noticeRecipient.createMany({
          data: recipientsData,
        });

        // Dispatch email (via Resend) and WhatsApp (stubbed as pending) notifications
        for (const tenantId of tenantIds) {
          for (const channel of input.channels) {
            if (channel === NotificationChannel.in_app) continue;

            try {
              const log = await dispatchNotification({
                recipientId: tenantId,
                channel,
                relatedType: RelatedType.notice,
                relatedId: notice.id,
                title: input.title,
                body: input.body,
              });

              // Map NotificationStatus to DeliveryStatus
              const deliveryStatus =
                log.status === "sent" || log.status === "delivered"
                  ? "sent"
                  : log.status === "pending"
                  ? "pending"
                  : "failed";

              const updateData: {
                emailStatus?: DeliveryStatus;
                whatsappStatus?: DeliveryStatus;
              } = {};
              if (channel === NotificationChannel.email) {
                updateData.emailStatus = deliveryStatus;
              } else if (channel === NotificationChannel.whatsapp) {
                updateData.whatsappStatus = deliveryStatus;
              }

              await prisma.noticeRecipient.updateMany({
                where: {
                  noticeId: notice.id,
                  tenantId,
                },
                data: updateData,
              });
            } catch (err) {
              console.error(`[notices.send] Failed to dispatch ${channel} notice for tenant ${tenantId}:`, err);
            }
          }
        }
      }

      return {
        notice,
        recipientCount: tenantIds.length,
      };
    }),

  // List sent notices (Landlord only)
  listSent: authedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== Role.landlord) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only landlords can view sent notices.",
      });
    }

    return await prisma.notice.findMany({
      where: { landlordId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        recipients: {
          include: {
            tenant: { select: { fullName: true, email: true } },
          },
        },
      },
    });
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
