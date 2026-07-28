import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { createNotification } from "../utils/notifications";

export const conversationsRouter = router({
  // Get or create conversation for a unit
  getForUnit: authedProcedure
    .input(z.object({ unitId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const lease = await prisma.lease.findFirst({
        where: {
          unitId: input.unitId,
          terminatedAt: null,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        include: {
          unit: {
            include: { property: true },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active lease found for this unit. Chat is only available for occupied units.",
        });
      }

      const isLandlord = ctx.user.role === Role.landlord && lease.unit.property.landlordId === ctx.user.id;
      const isTenant = ctx.user.role === Role.tenant && lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to access this conversation.",
        });
      }

      return await prisma.conversation.upsert({
        where: {
          unitId_tenantId: {
            unitId: input.unitId,
            tenantId: lease.tenantId,
          },
        },
        create: {
          unitId: input.unitId,
          landlordId: lease.unit.property.landlordId,
          tenantId: lease.tenantId,
        },
        update: {},
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            include: {
              sender: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
            },
          },
          landlord: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
          tenant: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
          unit: { select: { unitNumber: true } },
        },
      });
    }),

  // Send a message in a conversation
  sendMessage: authedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        body: z.string().min(1),
        attachmentUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found.",
        });
      }

      const isLandlord = ctx.user.role === Role.landlord && conversation.landlordId === ctx.user.id;
      const isTenant = ctx.user.role === Role.tenant && conversation.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to send messages in this conversation.",
        });
      }

      const message = await prisma.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          body: input.body,
          attachmentUrl: input.attachmentUrl || null,
        },
        include: {
          sender: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
        },
      });

      // Notify the recipient
      const recipientId = isLandlord ? conversation.tenantId : conversation.landlordId;
      const previewText = input.body.length > 50 ? input.body.substring(0, 50) + "..." : input.body;

      try {
        await createNotification({
          recipientId,
          type: "message_received",
          title: `New Message`,
          body: `${ctx.user.fullName}: "${previewText}"`,
          relatedType: "conversation",
          relatedId: conversation.id,
        });
      } catch (err) {
        console.error("Failed to trigger message notification:", err);
      }

      return message;
    }),

  // Mark all counterparty messages in conversation as read
  markRead: authedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found.",
        });
      }

      const isLandlord = ctx.user.role === Role.landlord && conversation.landlordId === ctx.user.id;
      const isTenant = ctx.user.role === Role.tenant && conversation.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to mark this conversation as read.",
        });
      }

      return await prisma.message.updateMany({
        where: {
          conversationId: input.conversationId,
          senderId: { not: ctx.user.id },
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });
    }),

  // Get redirect routing information for a conversation
  getRedirectInfo: authedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ input }) => {
      const conv = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
        include: {
          unit: { select: { id: true, propertyId: true } }
        }
      });
      return conv ? { unitId: conv.unit.id, propertyId: conv.unit.propertyId } : null;
    }),
});
