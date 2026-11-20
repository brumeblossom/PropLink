import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== 1. FINDING TEST DATA ===");

  // 1. Find Landlord "Verified Landlord"
  const landlords = await prisma.user.findMany({
    where: { fullName: "Verified Landlord" },
  });
  console.log(`Found ${landlords.length} landlord(s) "Verified Landlord":`);
  landlords.forEach((l) => console.log(` - ID: ${l.id}, Name: ${l.fullName}, Email: ${l.email}`));

  // 2. Find Property "Test Verification Estate"
  const properties = await prisma.property.findMany({
    where: { name: "Test Verification Estate" },
  });
  console.log(`Found ${properties.length} property/properties "Test Verification Estate":`);
  properties.forEach((p) => console.log(` - ID: ${p.id}, Name: ${p.name}`));

  // 3. Find Unit "TEST-INV-1"
  const units = await prisma.unit.findMany({
    where: { unitNumber: "TEST-INV-1" },
  });
  console.log(`Found ${units.length} unit(s) "TEST-INV-1":`);
  units.forEach((u) => console.log(` - ID: ${u.id}, Unit: ${u.unitNumber}`));

  // 4. Find Invitation to David Great (workwithbrume@gmail.com) for test property/unit
  const invitations = await prisma.lease.findMany({
    where: {
      OR: [
        { id: "86a01e1e-ba7b-4824-bb0c-490bed491951" },
        { unit: { unitNumber: "TEST-INV-1" } },
        { unit: { property: { name: "Test Verification Estate" } } },
      ],
    },
    include: {
      tenant: true,
      unit: { include: { property: true } },
    },
  });
  console.log(`Found ${invitations.length} test invitation lease(s):`);
  invitations.forEach((inv) =>
    console.log(` - ID: ${inv.id}, Tenant: ${inv.tenant?.fullName} (${inv.tenant?.email}), Unit: ${inv.unit?.unitNumber}`)
  );

  // 5. Find Notifications mentioning "TEST-INV-1" or "Test Verification Estate"
  const notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { body: { contains: "TEST-INV-1" } },
        { body: { contains: "Test Verification Estate" } },
      ],
    },
  });
  console.log(`Found ${notifications.length} notification(s):`);
  notifications.forEach((n) => console.log(` - ID: ${n.id}, Type: ${n.type}, Body: "${n.body}"`));

  console.log("\n=== 2. DELETING TEST DATA ===");

  // Delete notifications first
  if (notifications.length > 0) {
    const deletedNotifs = await prisma.notification.deleteMany({
      where: {
        id: { in: notifications.map((n) => n.id) },
      },
    });
    console.log(`Deleted ${deletedNotifs.count} notification(s)`);
  } else {
    console.log("No notifications to delete.");
  }

  // Delete test invitations (leases)
  if (invitations.length > 0) {
    const deletedLeases = await prisma.lease.deleteMany({
      where: {
        id: { in: invitations.map((i) => i.id) },
      },
    });
    console.log(`Deleted ${deletedLeases.count} invitation lease(s)`);
  } else {
    console.log("No test invitations to delete.");
  }

  // Delete units
  if (units.length > 0) {
    const deletedUnits = await prisma.unit.deleteMany({
      where: {
        id: { in: units.map((u) => u.id) },
      },
    });
    console.log(`Deleted ${deletedUnits.count} unit(s)`);
  } else {
    console.log("No test units to delete.");
  }

  // Delete properties
  if (properties.length > 0) {
    const deletedProps = await prisma.property.deleteMany({
      where: {
        id: { in: properties.map((p) => p.id) },
      },
    });
    console.log(`Deleted ${deletedProps.count} property/properties`);
  } else {
    console.log("No test properties to delete.");
  }

  // Delete landlords
  if (landlords.length > 0) {
    const deletedLandlords = await prisma.user.deleteMany({
      where: {
        id: { in: landlords.map((l) => l.id) },
      },
    });
    console.log(`Deleted ${deletedLandlords.count} landlord(s)`);
  } else {
    console.log("No test landlords to delete.");
  }

  console.log("=== CLEANUP COMPLETE ===");
}

main()
  .catch((e) => {
    console.error("Cleanup error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
