import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const notificationsRouter = router({
  // List received system notifications (both roles)
  listReceived: authedProcedure.query(async ({ ctx }) => {
    return await prisma.notification.findMany({
      where: { recipientId: ctx.user.id },
      orderBy: { createdAt: "desc" },
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
