import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { getCurrentLease, getNextLease, getUnitStatus } from "@/lib/leases";
import { canDeleteUnit, getUnitDeleteErrorMessage } from "@/lib/unit-delete";


export const unitsRouter = router({
  listByProperty: authedProcedure
    .input(z.object({ propertyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const property = await prisma.property.findFirst({
        where: { id: input.propertyId, deletedAt: null },
      });

      if (!property || property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this property.",
        });
      }

      const now = new Date();
      const units = await prisma.unit.findMany({
        where: { propertyId: input.propertyId, deletedAt: null },
        include: {
          leases: {
            where: {
              status: { notIn: ["declined", "cancelled"] },
            },
            include: {
              tenant: {
                select: { fullName: true },
              },
              inviteCodes: {
                select: { code: true, redeemedAt: true, expiresAt: true },
              },
            },
            orderBy: { startDate: "desc" },
          },
        },
        orderBy: { unitNumber: "asc" },
      });

      return units.map((unit) => {
        const currentLease = getCurrentLease(unit.leases, now);
        const nextLease = getNextLease(unit.leases, now);
        const status = getUnitStatus(unit.leases, now);
        const deleteCheck = canDeleteUnit(unit.leases, now);
        return {
          id: unit.id,
          propertyId: unit.propertyId,
          unitNumber: unit.unitNumber,
          unitType: unit.unitType,
          sizeSqm: unit.sizeSqm,
          createdAt: unit.createdAt,
          status,
          deleteCheck,
          activeLease: currentLease
            ? {
                id: currentLease.id,
                tenantName: currentLease.tenant.fullName,
                startDate: currentLease.startDate,
                endDate: currentLease.endDate,
                rentAmount: currentLease.rentAmount,
              }
            : null,
          nextLease: nextLease
            ? {
                id: nextLease.id,
                tenantName: nextLease.tenant.fullName,
                startDate: nextLease.startDate,
                endDate: nextLease.endDate,
                rentAmount: nextLease.rentAmount,
              }
            : null,
        };
      });
    }),

  create: authedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid(),
        unitNumber: z.string().min(1),
        unitType: z.string().min(1),
        roomsCount: z.number().int().nonnegative().optional().nullable(),
        sizeSqm: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const property = await prisma.property.findUnique({
        where: { id: input.propertyId },
      });

      if (!property || property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this property.",
        });
      }

      return await prisma.unit.create({
        data: {
          propertyId: input.propertyId,
          unitNumber: input.unitNumber,
          unitType: input.unitType,
          roomsCount: input.roomsCount ?? null,
          sizeSqm: input.sizeSqm ?? null,
        },
      });
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        unitNumber: z.string().min(1),
        unitType: z.string().min(1),
        roomsCount: z.number().int().nonnegative().optional().nullable(),
        sizeSqm: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const unit = await prisma.unit.findFirst({
        where: { id: input.id, deletedAt: null },
        include: { property: true },
      });

      if (!unit || unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      return await prisma.unit.update({
        where: { id: input.id },
        data: {
          unitNumber: input.unitNumber,
          unitType: input.unitType,
          roomsCount: input.roomsCount ?? null,
          sizeSqm: input.sizeSqm ?? null,
        },
      });
    }),

  getStatus: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const unit = await prisma.unit.findFirst({
        where: { id: input.id, deletedAt: null, property: { deletedAt: null } },
        include: {
          property: true,
          leases: {
            where: {
              terminatedAt: null,
              status: { notIn: ["declined", "cancelled"] },
            },
            include: {
              tenant: {
                select: { id: true, fullName: true, email: true },
              },
              inviteCodes: {
                select: { code: true, redeemedAt: true, expiresAt: true },
              },
            },
            orderBy: { startDate: "desc" },
          },
        },
      });

      if (!unit || unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Unit not found.",
        });
      }

      const currentLease = getCurrentLease(unit.leases, now);
      const nextLease = getNextLease(unit.leases, now);
      const status = getUnitStatus(unit.leases, now);

      const rawPending = unit.leases.find(
        (l) => l.status === "pending" || l.status === "expired"
      );
      const pendingLease = rawPending
        ? {
            ...rawPending,
            isExpired:
              rawPending.status === "expired" ||
              Boolean(
                rawPending.invitationExpiresAt &&
                  new Date(rawPending.invitationExpiresAt) < now
              ),
          }
        : null;

      return {
        status,
        activeLease: currentLease
          ? {
              id: currentLease.id,
              tenantName: currentLease.tenant.fullName,
              startDate: currentLease.startDate,
              endDate: currentLease.endDate,
              rentAmount: currentLease.rentAmount,
            }
          : null,
        currentLease,
        nextLease,
        pendingLease,
      };
    }),

  createBulk: authedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid(),
        units: z.array(
          z.object({
            unitNumber: z.string().min(1),
            unitType: z.string().min(1),
            roomsCount: z.number().int().nonnegative().optional().nullable(),
          })
        ).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const property = await prisma.property.findUnique({
        where: { id: input.propertyId },
      });

      if (!property || property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this property.",
        });
      }

      // Check for duplicates inside the incoming list
      const incomingNumbers = input.units.map((u) => u.unitNumber.trim());
      const uniqueIncomingNumbers = new Set(incomingNumbers);
      if (uniqueIncomingNumbers.size !== incomingNumbers.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Duplicate unit numbers detected in the bulk list.",
        });
      }

      // Check if any of these unit numbers already exist in the database for this property
      const existingUnits = await prisma.unit.findMany({
        where: {
          propertyId: input.propertyId,
          unitNumber: { in: incomingNumbers },
          deletedAt: null,
        },
        select: { unitNumber: true },
      });

      if (existingUnits.length > 0) {
        const dupes = existingUnits.map((u) => u.unitNumber).join(", ");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `The following unit numbers already exist for this property: ${dupes}`,
        });
      }

      // Create units
      const createData = input.units.map((u) => ({
        propertyId: input.propertyId,
        unitNumber: u.unitNumber.trim(),
        unitType: u.unitType,
        roomsCount: u.roomsCount ?? null,
      }));

      await prisma.unit.createMany({
        data: createData,
      });

      return { count: createData.length };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const unit = await prisma.unit.findFirst({
        where: { id: input.id, deletedAt: null },
        include: {
          property: true,
          leases: {
            include: {
              tenant: { select: { fullName: true } },
              inviteCodes: { select: { code: true, redeemedAt: true, expiresAt: true } },
            },
          },
        },
      });

      if (!unit || unit.property.landlordId !== ctx.user.id || unit.property.deletedAt !== null) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      const check = canDeleteUnit(unit.leases, now);
      if (!check.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: getUnitDeleteErrorMessage(unit.unitNumber, check),
        });
      }

      const leaseIds = unit.leases.map((l) => l.id);
      return await prisma.$transaction(async (tx) => {
        if (leaseIds.length > 0) {
          await tx.inviteCode.deleteMany({
            where: { leaseId: { in: leaseIds } },
          });
        }
        return await tx.unit.update({
          where: { id: input.id },
          data: { deletedAt: now },
        });
      });
    }),

  bulkDelete: authedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();

      // Find all specified units that are not already deleted
      const units = await prisma.unit.findMany({
        where: {
          id: { in: input.ids },
          deletedAt: null,
          property: { deletedAt: null },
        },
        include: {
          property: true,
          leases: {
            include: {
              tenant: { select: { fullName: true } },
              inviteCodes: { select: { code: true, redeemedAt: true, expiresAt: true } },
            },
          },
        },
      });

      // Verify that all requested units exist and landlord owns every unit
      if (units.length !== input.ids.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or more units could not be found.",
        });
      }

      for (const unit of units) {
        if (unit.property.landlordId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not own all of the selected units.",
          });
        }

        const check = canDeleteUnit(unit.leases, now);
        if (!check.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: getUnitDeleteErrorMessage(unit.unitNumber, check),
          });
        }
      }

      const allLeaseIds = units.flatMap((u) => u.leases.map((l) => l.id));
      const result = await prisma.$transaction(async (tx) => {
        if (allLeaseIds.length > 0) {
          await tx.inviteCode.deleteMany({
            where: { leaseId: { in: allLeaseIds } },
          });
        }
        const updateResult = await tx.unit.updateMany({
          where: {
            id: { in: input.ids },
            deletedAt: null,
          },
          data: {
            deletedAt: now,
          },
        });
        return updateResult.count;
      });

      return { count: result };
    }),

  // Get redirect routing information for a unit
  getRedirectInfo: authedProcedure
    .input(z.object({ unitId: z.string().uuid() }))
    .query(async ({ input }) => {
      const unit = await prisma.unit.findFirst({
        where: { id: input.unitId, deletedAt: null, property: { deletedAt: null } },
        select: { id: true, propertyId: true },
      });
      return unit ? { unitId: unit.id, propertyId: unit.propertyId } : null;
    }),
});
