import { PrismaClient } from '@prisma/client';
import { dispatchNotification } from '../src/server/services/notificationDispatcher';

const prisma = new PrismaClient();

// Helper to calculate date relative to today
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function getDaysDifference(d1: Date, d2: Date): number {
  const utc1 = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate());
  const utc2 = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());
  return Math.round((utc1 - utc2) / (1000 * 60 * 60 * 24));
}

function getLeasePeriods(startDate: Date, endDate: Date, rentFrequency: string) {
  const periods: { start: Date; end: Date }[] = [];
  let currentStart = new Date(startDate);
  const leaseEnd = new Date(endDate);

  while (currentStart < leaseEnd) {
    let nextEnd = new Date(currentStart);
    if (rentFrequency === "monthly") {
      nextEnd.setMonth(nextEnd.getMonth() + 1);
    } else if (rentFrequency === "quarterly") {
      nextEnd.setMonth(nextEnd.getMonth() + 3);
    } else if (rentFrequency === "annually") {
      nextEnd.setFullYear(nextEnd.getFullYear() + 1);
    } else {
      nextEnd = new Date(leaseEnd);
    }

    if (nextEnd > leaseEnd) {
      nextEnd = new Date(leaseEnd);
    }

    periods.push({
      start: new Date(currentStart),
      end: new Date(nextEnd),
    });

    if (nextEnd.getTime() <= currentStart.getTime()) {
      break;
    }
    currentStart = nextEnd;
  }
  return periods;
}

async function runReminderCheck() {
  const now = new Date();
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
  const actions: any[] = [];

  for (const lease of activeLeases) {
    const confirmedPayments = await prisma.payment.findMany({
      where: {
        leaseId: lease.id,
        status: "confirmed",
      },
    });

    const periods = getLeasePeriods(lease.startDate, lease.endDate, lease.rentFrequency);
    const rentAmount = Number(lease.rentAmount);
    let nextDueDate = null;

    for (const period of periods) {
      const periodPayments = confirmedPayments.filter(
        (p) =>
          new Date(p.periodStart).getTime() === period.start.getTime() &&
          new Date(p.periodEnd).getTime() === period.end.getTime()
      );
      const amountPaid = periodPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      if (amountPaid < rentAmount) {
        nextDueDate = period.start;
        break;
      }
    }

    if (!nextDueDate) continue;

    const daysUntilDue = getDaysDifference(nextDueDate, now);

    if (daysUntilDue === 7 || daysUntilDue === 1) {
      remindersChecked++;
      const threshold = daysUntilDue;
      const dueDateStr = nextDueDate.toISOString().split("T")[0];
      const customId = `reminder-${threshold}-${dueDateStr}`;

      const existingLog = await prisma.notificationLog.findFirst({
        where: {
          relatedId: lease.id,
          relatedType: "reminder",
          providerMessageId: {
            startsWith: customId,
          },
        },
      });

      if (existingLog) {
        actions.push({ leaseId: lease.id, status: "skipped_idempotent", threshold, dueDateStr });
        continue;
      }

      const formattedRent = `₦${rentAmount.toLocaleString()}`;
      const title = `Rent Due Reminder (${threshold} Day${threshold > 1 ? "s" : ""})`;
      const body = `Hello ${lease.tenant.fullName},\n\nThis is a friendly reminder that your rent of ${formattedRent} for the period starting ${dueDateStr} is due in ${threshold} day${threshold > 1 ? "s" : ""}.\n\nThank you,\n${lease.unit.property.name} Management`;

      // Email dispatch
      await dispatchNotification({
        recipientId: lease.tenantId,
        channel: "email",
        relatedType: "reminder",
        relatedId: lease.id,
        title,
        body,
        customId,
      });

      // WhatsApp dispatch
      await dispatchNotification({
        recipientId: lease.tenantId,
        channel: "whatsapp",
        relatedType: "reminder",
        relatedId: lease.id,
        title,
        body,
        customId,
      });

      remindersSent++;
      actions.push({ leaseId: lease.id, status: "sent", threshold, dueDateStr });
    }
  }

  return { remindersChecked, remindersSent, actions };
}

async function main() {
  console.log("=== START VERIFICATION ===");
  
  // 1. Setup test landlord
  const landlord = await prisma.user.upsert({
    where: { email: 'cron-landlord@test.com' },
    update: {},
    create: {
      email: 'cron-landlord@test.com',
      fullName: 'Test Landlord',
      role: 'landlord',
    }
  });
  console.log(`Landlord: ${landlord.id}`);

  // 2. Setup test tenant
  const tenant = await prisma.user.upsert({
    where: { email: 'cron-tenant@test.com' },
    update: {},
    create: {
      email: 'cron-tenant@test.com',
      fullName: 'Test Tenant',
      role: 'tenant',
      phone: '+2348000000000'
    }
  });
  console.log(`Tenant: ${tenant.id}`);

  // 3. Setup property & unit
  const property = await prisma.property.create({
    data: {
      landlordId: landlord.id,
      name: 'Verification Estates',
      address: '123 Cron Lane',
      city: 'Lagos',
      state: 'Lagos',
      propertyType: 'residential',
    }
  });
  const unit = await prisma.unit.create({
    data: {
      propertyId: property.id,
      unitNumber: 'Unit 99C',
      unitType: 'apartment/flat',
    }
  });
  console.log(`Property: ${property.id}, Unit: ${unit.id}`);

  // 4. Create lease due in exactly 7 days
  const today = new Date();
  const startDate = addDays(today, 7);
  const endDate = addDays(today, 365); // 1 year lease

  const lease = await prisma.lease.create({
    data: {
      unitId: unit.id,
      tenantId: tenant.id,
      startDate: startDate,
      endDate: endDate,
      rentAmount: 150000,
      rentFrequency: 'monthly',
      renewalWindowDays: 60,
    }
  });
  console.log(`Lease created: ${lease.id}, Start Date (Due Date): ${startDate.toISOString().split('T')[0]}`);

  // Ensure any previous notification logs for this lease are deleted
  await prisma.notificationLog.deleteMany({
    where: { relatedId: lease.id }
  });

  // TEST 1: Run reminder check first time (should send)
  console.log("\n--- TEST 1: Running reminder check (expected: SEND) ---");
  const res1 = await runReminderCheck();
  console.log("Result 1:", JSON.stringify(res1, null, 2));

  // Verify DB logs exist
  const logs1 = await prisma.notificationLog.findMany({
    where: { relatedId: lease.id }
  });
  console.log(`Found ${logs1.length} logs in DB (expect 2: 1 email, 1 whatsapp)`);
  logs1.forEach(log => {
    console.log(` - Channel: ${log.channel}, Status: ${log.status}, ID: ${log.providerMessageId}`);
  });

  if (logs1.length !== 2) {
    throw new Error("TEST 1 FAILED: Expected 2 notification logs.");
  }

  // TEST 2: Run check twice (should skip due to idempotency)
  console.log("\n--- TEST 2: Running reminder check again (expected: SKIP - IDEMPOTENT) ---");
  const res2 = await runReminderCheck();
  console.log("Result 2:", JSON.stringify(res2, null, 2));

  // TEST 3: Create a PENDING payment covering the period, trigger check (should NOT skip since not confirmed)
  console.log("\n--- TEST 3: Logging a PENDING payment (expected: SEND) ---");
  // Clean logs first
  await prisma.notificationLog.deleteMany({ where: { relatedId: lease.id } });
  
  const pendingPayment = await prisma.payment.create({
    data: {
      leaseId: lease.id,
      amount: 150000,
      paymentDate: today,
      periodStart: startDate,
      periodEnd: (() => {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + 1);
        return d;
      })(),
      method: 'bank_transfer',
      recordedBy: tenant.id,
      recordedByRole: 'tenant',
      status: 'pending',
    }
  });

  const res3 = await runReminderCheck();
  console.log("Result 3 (with pending payment):", JSON.stringify(res3, null, 2));
  
  const logs3 = await prisma.notificationLog.findMany({ where: { relatedId: lease.id } });
  console.log(`Found ${logs3.length} logs in DB (expect 2)`);

  if (logs3.length !== 2) {
    throw new Error("TEST 3 FAILED: Pending payment should NOT have suppressed the reminder.");
  }

  // TEST 4: Confirm the payment, trigger check (should SKIP since confirmed)
  console.log("\n--- TEST 4: Confirming payment (expected: SKIP - PAID) ---");
  // Clean logs first
  await prisma.notificationLog.deleteMany({ where: { relatedId: lease.id } });

  await prisma.payment.update({
    where: { id: pendingPayment.id },
    data: { status: 'confirmed', confirmedBy: landlord.id, confirmedAt: new Date() }
  });

  const res4 = await runReminderCheck();
  console.log("Result 4 (with confirmed payment):", JSON.stringify(res4, null, 2));

  const logs4 = await prisma.notificationLog.findMany({ where: { relatedId: lease.id } });
  console.log(`Found ${logs4.length} logs in DB (expect 0)`);

  if (logs4.length !== 0) {
    throw new Error("TEST 4 FAILED: Confirmed payment should have suppressed the reminder.");
  }

  // Cleanup test data
  console.log("\n--- CLEANING UP TEST DATA ---");
  await prisma.payment.deleteMany({ where: { leaseId: lease.id } });
  await prisma.lease.delete({ where: { id: lease.id } });
  await prisma.unit.delete({ where: { id: unit.id } });
  await prisma.property.delete({ where: { id: property.id } });

  console.log("Verification finished successfully!");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
