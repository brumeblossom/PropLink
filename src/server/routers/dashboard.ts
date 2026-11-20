import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { PaymentStatus, Role } from "@prisma/client";
import { formatDateGB } from "@/lib/billing";
import { getCurrentLease, getUnitStatus } from "@/lib/leases";

export const dashboardRouter = router({
  landlordSummary: authedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== Role.landlord) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only landlords can view the landlord dashboard summary.",
      });
    }

    const now = new Date();

    // Run parallel aggregated queries in ONE round-trip
    const [properties, activeLeasesEndingSoon, pendingPaymentsData] = await Promise.all([
      // 1. All properties for the landlord with active non-deleted units and their active leases
      prisma.property.findMany({
        where: { landlordId: ctx.user.id },
        include: {
          units: {
            where: { deletedAt: null },
            include: {
              leases: {
                where: {
                  terminatedAt: null,
                },
                include: {
                  tenant: {
                    select: {
                      id: true,
                      fullName: true,
                    },
                  },
                  inviteCodes: {
                    select: {
                      redeemedAt: true,
                      expiresAt: true,
                    },
                  },
                },
                orderBy: { startDate: "desc" },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),

      // 2. Active leases ending in the next 60 days or with renewal due
      prisma.lease.findMany({
        where: {
          unit: {
            property: { landlordId: ctx.user.id },
            deletedAt: null,
          },
          terminatedAt: null,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        include: {
          unit: {
            select: {
              id: true,
              unitNumber: true,
              property: {
                select: { id: true, name: true },
              },
              leases: {
                where: {
                  terminatedAt: null,
                  startDate: { gt: now },
                },
                select: { id: true },
              },
            },
          },
          tenant: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { endDate: "asc" },
      }),

      // 3. Pending payments logged by tenants
      prisma.payment.findMany({
        where: {
          lease: {
            unit: {
              property: { landlordId: ctx.user.id },
              deletedAt: null,
            },
          },
          status: PaymentStatus.pending,
        },
        include: {
          lease: {
            include: {
              unit: {
                select: {
                  id: true,
                  unitNumber: true,
                  property: {
                    select: { id: true, name: true },
                  },
                },
              },
              tenant: {
                select: { id: true, fullName: true },
              },
            },
          },
        },
        orderBy: { paymentDate: "desc" },
      }),
    ]);

    // Aggregate overall statistics
    const totalProperties = properties.length;
    let totalUnits = 0;
    let occupiedUnits = 0;

    // Type counters
    const propertyTypeCounts = {
      residential: 0,
      commercial: 0,
      mixed: 0,
    };
    const unitTypeMap: Record<string, number> = {};

    // Occupancy per property
    const occupancyByProperty = properties.map((property) => {
      const pTotal = property.units.length;
      const pOccupied = property.units.filter((u) => getUnitStatus(u.leases, now) === "occupied").length;
      const pVacant = pTotal - pOccupied;

      totalUnits += pTotal;
      occupiedUnits += pOccupied;

      if (property.propertyType in propertyTypeCounts) {
        propertyTypeCounts[property.propertyType as keyof typeof propertyTypeCounts]++;
      }

      property.units.forEach((u) => {
        const type = u.unitType || "Other";
        unitTypeMap[type] = (unitTypeMap[type] || 0) + 1;
      });

      return {
        propertyId: property.id,
        propertyName: property.name,
        occupied: pOccupied,
        vacant: pVacant,
        total: pTotal,
      };
    });

    const vacantUnits = totalUnits - occupiedUnits;
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    // 1. Properties by type
    const propertiesByType = [
      { type: "residential", label: "Residential", count: propertyTypeCounts.residential },
      { type: "commercial", label: "Commercial", count: propertyTypeCounts.commercial },
      { type: "mixed", label: "Mixed-Use", count: propertyTypeCounts.mixed },
    ];

    // 2. Units by unit type (sorted largest first)
    const unitsByType = Object.entries(unitTypeMap)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // 4. Tenants by location (state or city if all properties are in one state)
    const uniqueStates = Array.from(
      new Set(properties.map((p) => p.state?.trim()).filter(Boolean))
    );
    const useCity = uniqueStates.length <= 1;
    const locationLevel: "city" | "state" = useCity ? "city" : "state";

    const locationMap: Record<string, Set<string>> = {};
    properties.forEach((p) => {
      const loc = (useCity ? p.city : p.state)?.trim() || "Unknown";
      if (!locationMap[loc]) {
        locationMap[loc] = new Set<string>();
      }
      p.units.forEach((u) => {
        const current = getCurrentLease(u.leases, now);
        if (current?.tenant?.id) {
          locationMap[loc].add(current.tenant.id);
        }
      });
    });

    const tenantsByLocation = {
      level: locationLevel,
      data: Object.entries(locationMap)
        .map(([location, tenantSet]) => ({
          location,
          count: tenantSet.size,
        }))
        .sort((a, b) => b.count - a.count),
    };

    // 5. Leases ending soon (within 60 days or renewal due)
    const leasesEndingSoon = activeLeasesEndingSoon
      .map((lease) => {
        const end = new Date(lease.endDate);
        const diffTime = end.getTime() - now.getTime();
        const daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        const renewalWindow = lease.renewalWindowDays ?? 60;
        const isRenewalDue = daysLeft <= renewalWindow;
        const isEndingIn60Days = daysLeft <= 60;

        if (!isRenewalDue && !isEndingIn60Days) return null;
        if (lease.unit.leases && lease.unit.leases.length > 0) return null;

        return {
          leaseId: lease.id,
          unitId: lease.unit.id,
          propertyId: lease.unit.property.id,
          tenantName: lease.tenant.fullName,
          unitNumber: lease.unit.unitNumber,
          propertyName: lease.unit.property.name,
          endDate: formatDateGB(lease.endDate),
          daysLeft,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 10);

    // 6. Payments waiting for you
    const pendingPayments = {
      count: pendingPaymentsData.length,
      items: pendingPaymentsData.slice(0, 5).map((p) => ({
        paymentId: p.id,
        unitId: p.lease.unit.id,
        propertyId: p.lease.unit.property.id,
        tenantName: p.lease.tenant.fullName,
        unitNumber: p.lease.unit.unitNumber,
        propertyName: p.lease.unit.property.name,
        amount: Number(p.amount),
        date: formatDateGB(p.paymentDate),
      })),
    };

    // Properties table
    const propertiesTable = properties.map((property) => {
      const pTotal = property.units.length;
      const pOccupied = property.units.filter((u) => getUnitStatus(u.leases, now) === "occupied").length;
      const pVacant = pTotal - pOccupied;
      const pRate = pTotal > 0 ? Math.round((pOccupied / pTotal) * 100) : 0;

      return {
        id: property.id,
        name: property.name,
        propertyType: property.propertyType,
        city: property.city,
        state: property.state,
        totalUnits: pTotal,
        occupiedUnits: pOccupied,
        vacantUnits: pVacant,
        occupancyRate: pRate,
      };
    });

    return {
      stats: {
        totalProperties,
        totalUnits,
        occupiedUnits,
        vacantUnits,
        occupancyRate,
      },
      propertiesByType,
      unitsByType,
      occupancyByProperty,
      tenantsByLocation,
      leasesEndingSoon,
      pendingPayments,
      propertiesTable,
    };
  }),
});
