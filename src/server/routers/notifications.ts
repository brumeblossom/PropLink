import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const notificationsRouter = router({
  // List received system notifications (both roles), enriched with unit/property info
  listReceived: authedProcedure.query(async ({ ctx }) => {
    const notifications = await prisma.notification.findMany({
      where: { recipientId: ctx.user.id },
      orderBy: { createdAt: "desc" },
    });

    const paymentIds: string[] = [];
    const leaseIds: string[] = [];
    const unitIds: string[] = [];
    const conversationIds: string[] = [];

    notifications.forEach((n) => {
      if (!n.relatedId) return;
      if (n.relatedType === "payment") paymentIds.push(n.relatedId);
      else if (n.relatedType === "lease") leaseIds.push(n.relatedId);
      else if (n.relatedType === "unit") unitIds.push(n.relatedId);
      else if (n.relatedType === "conversation") conversationIds.push(n.relatedId);
    });

    const [payments, leases, units, conversations] = await Promise.all([
      paymentIds.length > 0
        ? prisma.payment.findMany({
            where: { id: { in: paymentIds } },
            select: {
              id: true,
              disputeReason: true,
              lease: {
                select: {
                  unit: {
                    select: {
                      unitNumber: true,
                      property: { select: { name: true } },
                    },
                  },
                },
              },
            },
          })
        : [],
      leaseIds.length > 0
        ? prisma.lease.findMany({
            where: { id: { in: leaseIds } },
            select: {
              id: true,
              unit: {
                select: {
                  unitNumber: true,
                  property: { select: { name: true } },
                },
              },
            },
          })
        : [],
      unitIds.length > 0
        ? prisma.unit.findMany({
            where: { id: { in: unitIds } },
            select: {
              id: true,
              unitNumber: true,
              property: { select: { name: true } },
            },
          })
        : [],
      conversationIds.length > 0
        ? prisma.conversation.findMany({
            where: { id: { in: conversationIds } },
            select: {
              id: true,
              unit: {
                select: {
                  unitNumber: true,
                  property: { select: { name: true } },
                },
              },
            },
          })
        : [],
    ]);

    const paymentMap = new Map(payments.map((p) => [p.id, p]));
    const leaseMap = new Map(leases.map((l) => [l.id, l]));
    const unitMap = new Map(units.map((u) => [u.id, u]));
    const conversationMap = new Map(conversations.map((c) => [c.id, c]));

    return notifications.map((n) => {
      let unitNumber: string | null = null;
      let propertyName: string | null = null;
      let quote: string | null = null;

      if (n.relatedType === "payment" && n.relatedId) {
        const p = paymentMap.get(n.relatedId);
        if (p) {
          unitNumber = p.lease.unit.unitNumber;
          propertyName = p.lease.unit.property.name;
          if (p.disputeReason) quote = p.disputeReason;
        }
      } else if (n.relatedType === "lease" && n.relatedId) {
        const l = leaseMap.get(n.relatedId);
        if (l) {
          unitNumber = l.unit.unitNumber;
          propertyName = l.unit.property.name;
        }
      } else if (n.relatedType === "unit" && n.relatedId) {
        const u = unitMap.get(n.relatedId);
        if (u) {
          unitNumber = u.unitNumber;
          propertyName = u.property.name;
        }
      } else if (n.relatedType === "conversation" && n.relatedId) {
        const c = conversationMap.get(n.relatedId);
        if (c) {
          unitNumber = c.unit.unitNumber;
          propertyName = c.unit.property.name;
        }
      }

      return {
        ...n,
        unitNumber,
        propertyName,
        quote,
      };
    });
  }),

  // Mark a single notification as read
  markRead: authedProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const notification = await prisma.notification.findUnique({
        where: { id: input.notificationId },
      });

      if (!notification) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found.",
        });
      }

      if (notification.recipientId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to mark this notification as read.",
        });
      }

      return await prisma.notification.update({
        where: { id: input.notificationId },
        data: { readAt: new Date() },
      });
    }),

  // Mark all unread notifications AND notices as read in one action
  markAllRead: authedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    
    const [notificationsResult, noticesResult] = await prisma.$transaction([
      prisma.notification.updateMany({
        where: { recipientId: ctx.user.id, readAt: null },
        data: { readAt: now },
      }),
      prisma.noticeRecipient.updateMany({
        where: { tenantId: ctx.user.id, readAt: null },
        data: { readAt: now },
      }),
    ]);

    return {
      notificationsMarked: notificationsResult.count,
      noticesMarked: noticesResult.count,
    };
  }),
});
