import { z } from "zod";
import { router, internalProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { RelatedType, NotificationChannel, NotificationStatus } from "@prisma/client";
import { dispatchNotification } from "../services/notificationDispatcher";
import { formatCurrency } from "@/lib/utils";
import { getLeaseBalance, formatDateGB, formatLagosYMD, getLagosYMD, createLagosDate } from "@/lib/billing";
import { cleanupOldInviteAttempts } from "../utils/inviteRateLimit";

function computeHumanExpiryDuration(todayDate: Date, endDate: Date): string {
  const todayYMD = getLagosYMD(todayDate);
  const endYMD = getLagosYMD(endDate);
  const dToday = Date.UTC(todayYMD.year, todayYMD.month - 1, todayYMD.day);
  const dEnd = Date.UTC(endYMD.year, endYMD.month - 1, endYMD.day);
  const diffDays = Math.round((dEnd - dToday) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "today";
  }

  if (diffDays >= 56) {
    const months = Math.round(diffDays / 30.4);
    return months === 1 ? "1 month" : `${months} months`;
  }

  if (diffDays >= 21) {
    const weeks = Math.round(diffDays / 7);
    return `${weeks} weeks`;
  }

  if (diffDays >= 7) {
    const weeks = Math.round(diffDays / 7);
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }

  return diffDays === 1 ? "1 day" : `${diffDays} days`;
}

function getLeaseExpirySendDates(
  setting: {
    expiryEnabled: boolean;
    expiryStartMode: string;
    expiryMonthsBefore: number;
    expiryStartDate: Date | null;
    expiryFrequency: string;
  },
  leaseEndDate: Date
): Set<string> {
  const sendDates = new Set<string>();
  if (!setting.expiryEnabled) return sendDates;

  const endYMD = getLagosYMD(leaseEndDate);
  const endStr = formatLagosYMD(leaseEndDate);

  let startDate: Date;
  if (setting.expiryStartMode === "date" && setting.expiryStartDate) {
    const sYMD = getLagosYMD(setting.expiryStartDate);
    startDate = createLagosDate(sYMD.year, sYMD.month, sYMD.day);
  } else {
    const N = setting.expiryMonthsBefore || 2;
    let targetMonth = endYMD.month - N;
    let targetYear = endYMD.year;
    while (targetMonth <= 0) {
      targetMonth += 12;
      targetYear -= 1;
    }
    const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    const targetDay = Math.min(endYMD.day, daysInMonth);
    startDate = createLagosDate(targetYear, targetMonth, targetDay);
  }

  const startStr = formatLagosYMD(startDate);
  if (startStr > endStr) return sendDates;

  const freq = setting.expiryFrequency || "monthly";

  if (freq === "once") {
    sendDates.add(startStr);
  } else if (freq === "weekly") {
    let cur = new Date(startDate);
    while (formatLagosYMD(cur) <= endStr) {
      sendDates.add(formatLagosYMD(cur));
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 7, 0, 0, 0));
    }
  } else {
    const sYMD = getLagosYMD(startDate);
    for (let m = 0; m < 120; m++) {
      const totalMonths = (sYMD.month - 1) + m;
      const targetYear = sYMD.year + Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12 + 1;
      const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
      const targetDay = Math.min(sYMD.day, daysInMonth);
      const curDate = createLagosDate(targetYear, targetMonth, targetDay);
      const curStr = formatLagosYMD(curDate);
      if (curStr > endStr) break;
      sendDates.add(curStr);
    }
  }

  return sendDates;
}

function getDaysDifference(d1: Date, d2: Date) {
  // Compare normalized UTC midnight dates
  const utc1 = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate());
  const utc2 = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());
  return Math.round((utc1 - utc2) / (1000 * 60 * 60 * 24));
}

export const internalRouter = router({
  runRentReminderCheck: internalProcedure
    .mutation(async () => {
      const now = new Date();
      // Fetch active, non-terminated leases
      const activeLeases = await prisma.lease.findMany({
        where: {
          terminatedAt: null,
          endDate: { gte: now },
        },
        include: {
          tenant: true,
          unit: {
            include: { property: true },
          },
        },
      });

      let remindersChecked = 0;
      let remindersSent = 0;

      for (const lease of activeLeases) {
        // Fetch confirmed payments only (pending ones must NOT suppress reminders)
        const confirmedPayments = await prisma.payment.findMany({
          where: {
            leaseId: lease.id,
            status: "confirmed",
          },
        });

        // Calculate lease balance and the next unpaid due date using running balance
        const balance = getLeaseBalance(lease, confirmedPayments, now);
        const nextDueDate = balance.nextDueDate;

        if (!nextDueDate) {
          // Fully paid for all periods
          continue;
        }

        const daysUntilDue = getDaysDifference(nextDueDate, now);

        // Check if falls in reminder windows (exactly 7 or 1 days before due date)
        if (daysUntilDue === 7 || daysUntilDue === 1) {
          remindersChecked++;
          const threshold = daysUntilDue;
          const dueDateStr = nextDueDate.toISOString().split("T")[0];
          
          // Form customId for idempotency check (starts-with providerMessageId match)
          const customId = `reminder-${threshold}-${dueDateStr}`;

          // Check if reminder was already sent for this lease/threshold/due-date
          const existingLog = await prisma.notificationLog.findFirst({
            where: {
              relatedId: lease.id,
              relatedType: RelatedType.reminder,
              providerMessageId: {
                startsWith: customId,
              },
            },
          });

          if (existingLog) {
            console.log(`[runRentReminderCheck] Idempotent match found. Reminder already sent for lease ${lease.id}, threshold ${threshold}, due date ${dueDateStr}. Skipping.`);
            continue;
          }

          const rentAmount = balance.rentAmount;
          const formattedRent = formatCurrency(rentAmount);
          const title = `Rent Due Reminder (${threshold} Day${threshold > 1 ? "s" : ""})`;
          const body = `Hello ${lease.tenant.fullName},\n\nThis is a friendly reminder that your rent of ${formattedRent} is due in ${threshold} day${threshold > 1 ? "s" : ""} on ${dueDateStr}.\n\nThank you,\n${lease.unit.property.name} Management`;

          // Dispatch email via Resend
          await dispatchNotification({
            recipientId: lease.tenantId,
            channel: NotificationChannel.email,
            relatedType: RelatedType.reminder,
            relatedId: lease.id,
            title,
            body,
            customId,
          });

          remindersSent++;
        }
      }

      // --- LEASE EXPIRY REMINDERS (Part B4) ---
      let leaseExpiryChecked = 0;
      let leaseExpirySent = 0;
      const todayLagosStr = formatLagosYMD(now);

      const expiryEligibleLeases = await prisma.lease.findMany({
        where: {
          terminatedAt: null,
          endDate: { gte: now },
          status: "active",
        },
        include: {
          tenant: true,
          unit: {
            include: { property: true },
          },
        },
      });

      for (const lease of expiryEligibleLeases) {
        if (!lease.endDate) continue;

        leaseExpiryChecked++;

        // 1. Fetch tenant reminder settings (or use defaults)
        const userSetting = await prisma.tenantReminderSetting.findUnique({
          where: { userId: lease.tenantId },
        });

        const setting = userSetting || {
          expiryEnabled: true,
          expiryStartMode: "months",
          expiryMonthsBefore: 2,
          expiryStartDate: null,
          expiryFrequency: "monthly",
        };

        if (!setting.expiryEnabled) continue;

        // 2. Check if today (Africa/Lagos) is a send date
        const sendDates = getLeaseExpirySendDates(setting, lease.endDate);
        if (!sendDates.has(todayLagosStr)) continue;

        // 3. Check if lease has been renewed (no later lease for the same tenant and unit)
        const laterLease = await prisma.lease.findFirst({
          where: {
            unitId: lease.unitId,
            tenantId: lease.tenantId,
            id: { not: lease.id },
            startDate: { gte: lease.startDate },
            status: { in: ["active", "pending"] },
            terminatedAt: null,
          },
        });
        if (laterLease) continue;

        // 4. Idempotency: check notification_log
        const existingExpiryLog = await prisma.notificationLog.findFirst({
          where: {
            recipientId: lease.tenantId,
            relatedId: lease.id,
            relatedType: RelatedType.lease,
            providerMessageId: `lease_expiry-${todayLagosStr}`,
          },
        });
        if (existingExpiryLog) continue;

        // 5. Human duration X and texts
        const diffX = computeHumanExpiryDuration(now, lease.endDate);
        const title = diffX === "today" ? "Your lease ends today" : `Your lease ends in ${diffX}`;
        const body = `Your lease for ${lease.unit.unitNumber} at ${lease.unit.property.name} ends on ${formatDateGB(lease.endDate)}. Speak to your landlord if you'd like to renew.`;

        // 6. Create in-app Notification
        await prisma.notification.create({
          data: {
            recipientId: lease.tenantId,
            type: "lease_expiry",
            title,
            body,
            relatedType: "lease",
            relatedId: lease.id,
          },
        });

        // 7. Write to notification_log
        await prisma.notificationLog.create({
          data: {
            recipientId: lease.tenantId,
            channel: NotificationChannel.in_app,
            relatedType: RelatedType.lease,
            relatedId: lease.id,
            status: NotificationStatus.sent,
            providerMessageId: `lease_expiry-${todayLagosStr}`,
            sentAt: now,
          },
        });

        leaseExpirySent++;
      }

      // Cleanup invite attempts older than 1 day
      await cleanupOldInviteAttempts();

      return {
        success: true,
        leasesFound: activeLeases.length,
        remindersChecked,
        remindersSent,
        leaseExpiryChecked,
        leaseExpirySent,
      };
    }),

  dispatchNotification: internalProcedure
    .input(
      z.object({
        recipientId: z.string().uuid(),
        channel: z.nativeEnum(NotificationChannel),
        relatedType: z.nativeEnum(RelatedType),
        relatedId: z.string().uuid(),
        title: z.string().min(1),
        body: z.string().min(1),
        customId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await dispatchNotification(input);
    }),
});
