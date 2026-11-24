import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { getLagosYMD } from "@/lib/billing";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getLagosMonthRange(monthKey: string): { start: Date; end: Date } {
  // monthKey is "YYYY-MM", e.g. "2026-11"
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-12
  // Africa/Lagos is UTC+1 (offset -60 minutes from UTC, or UTC time is 1 hour behind Lagos)
  // First millisecond of month in Lagos: year-month-01 00:00:00.000 Lagos = year-month-01 00:00:00 UTC - 1 hour = previous day 23:00:00 UTC
  // Next month first millisecond in Lagos: nextMonth 00:00:00 Lagos = nextMonth 00:00:00 UTC - 1 hour
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - 60 * 60 * 1000);
  return { start, end };
}

export const notificationsRouter = router({
  // Distinct months for the user that have notifications, newest first
  months: authedProcedure.query(async ({ ctx }) => {
    const notifications = await prisma.notification.findMany({
      where: { recipientId: ctx.user.id },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const monthSet = new Set<string>();
    const monthList: Array<{ key: string; label: string }> = [];

    for (const n of notifications) {
      const ymd = getLagosYMD(n.createdAt);
      const key = `${ymd.year}-${String(ymd.month).padStart(2, "0")}`;
      if (!monthSet.has(key)) {
        monthSet.add(key);
        const label = `${MONTH_NAMES[ymd.month - 1]} ${ymd.year}`;
        monthList.push({ key, label });
      }
    }

    return monthList;
  }),

  // Paginated list with server-side month & unread filtering (20 per page, cursor-based on id/createdAt)
  list: authedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().uuid().optional(),
        filter: z.enum(["all", "unread"]).default("all"),
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(), // e.g. "2026-11"
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, filter, month } = input;

      const whereClause: Prisma.NotificationWhereInput = {
        recipientId: ctx.user.id,
      };

      if (filter === "unread") {
        whereClause.readAt = null;
      }

      if (month) {
        const { start, end } = getLagosMonthRange(month);
        whereClause.createdAt = {
          gte: start,
          lt: end,
        };
      }

      let cursorObj = undefined;
      if (cursor) {
        cursorObj = { id: cursor };
      }

      const notifications = await prisma.notification.findMany({
        take: limit + 1,
        cursor: cursorObj,
        skip: cursor ? 1 : 0,
        where: whereClause,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

      let nextCursor: string | undefined = undefined;
      if (notifications.length > limit) {
        const nextItem = notifications.pop();
        nextCursor = nextItem?.id;
      }

      // Enrich notification items with unit, property, and quote info
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
                status: true,
                invitationExpiresAt: true,
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

      const items = notifications.map((n) => {
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

      return {
        items,
        nextCursor,
      };
    }),
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
              status: true,
              invitationExpiresAt: true,
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

    const now = new Date();
    const expiredLeaseIds: string[] = [];
    leases.forEach((l) => {
      if (
        l.status === "expired" ||
        (l.status === "pending" && l.invitationExpiresAt && new Date(l.invitationExpiresAt) < now)
      ) {
        expiredLeaseIds.push(l.id);
      }
    });

    if (expiredLeaseIds.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          type: "lease_invitation",
          relatedType: "lease",
          relatedId: { in: expiredLeaseIds },
        },
      }).catch((err) => console.error("Failed to clean up expired lease invitation notifications:", err));
    }

    const paymentMap = new Map(payments.map((p) => [p.id, p]));
    const leaseMap = new Map(leases.map((l) => [l.id, l]));
    const unitMap = new Map(units.map((u) => [u.id, u]));
    const conversationMap = new Map(conversations.map((c) => [c.id, c]));

    const filtered = notifications.filter((n) => {
      if (n.relatedType === "lease") {
        if (!n.relatedId || !leaseMap.has(n.relatedId)) return false;
        if (n.type === "lease_invitation" && expiredLeaseIds.includes(n.relatedId)) return false;
      }
      return true;
    });

    return filtered.map((n) => {
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

  // Mark all unread notifications AND notices as read in one action, optionally filtered by month
  markAllRead: authedProcedure
    .input(
      z
        .object({
          month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const notificationWhere: Prisma.NotificationWhereInput = {
        recipientId: ctx.user.id,
        readAt: null,
      };

      const noticeWhere: Prisma.NoticeRecipientWhereInput = {
        tenantId: ctx.user.id,
        readAt: null,
      };

      if (input?.month) {
        const { start, end } = getLagosMonthRange(input.month);
        notificationWhere.createdAt = {
          gte: start,
          lt: end,
        };
        noticeWhere.notice = {
          createdAt: {
            gte: start,
            lt: end,
          },
        };
      }
      
      const [notificationsResult, noticesResult] = await prisma.$transaction([
        prisma.notification.updateMany({
          where: notificationWhere,
          data: { readAt: now },
        }),
        prisma.noticeRecipient.updateMany({
          where: noticeWhere,
          data: { readAt: now },
        }),
      ]);

      return {
        notificationsMarked: notificationsResult.count,
        noticesMarked: noticesResult.count,
      };
    }),
});
