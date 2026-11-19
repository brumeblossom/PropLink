import { z } from "zod";
import { router, internalProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { RelatedType, NotificationChannel } from "@prisma/client";
import { dispatchNotification } from "../services/notificationDispatcher";
import { formatCurrency } from "@/lib/utils";
import { getLeaseBalance } from "@/lib/billing";

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
          const body = `Hello ${lease.tenant.fullName},\n\nThis is a friendly reminder that your rent of ${formattedRent} for the period starting ${dueDateStr} is due in ${threshold} day${threshold > 1 ? "s" : ""}.\n\nThank you,\n${lease.unit.property.name} Management`;

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

          // Dispatch WhatsApp (stubbed)
          await dispatchNotification({
            recipientId: lease.tenantId,
            channel: NotificationChannel.whatsapp,
            relatedType: RelatedType.reminder,
            relatedId: lease.id,
            title,
            body,
            customId,
          });

          remindersSent++;
        }
      }

      return {
        success: true,
        leasesFound: activeLeases.length,
        remindersChecked,
        remindersSent,
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
