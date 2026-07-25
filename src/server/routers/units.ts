import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { UnitType } from "@prisma/client";

export const unitsRouter = router({
  listByProperty: authedProcedure
    .input(z.object({ propertyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const property = await prisma.property.findUnique({
        where: { id: input.propertyId },
      });

      if (!property || property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this property.",
        });
      }

      const now = new Date();
      const units = await prisma.unit.findMany({
        where: { propertyId: input.propertyId },
        include: {
          leases: {
            where: {
              terminatedAt: null,
              startDate: { lte: now },
              endDate: { gte: now },
            },
            include: {
              tenant: {
                select: { fullName: true },
              },
            },
          },
        },
        orderBy: { unitNumber: "asc" },
      });

      return units.map((unit) => {
        const activeLease = unit.leases[0] || null;
        return {
          id: unit.id,
          propertyId: unit.propertyId,
          unitNumber: unit.unitNumber,
          unitType: unit.unitType,
          sizeSqm: unit.sizeSqm,
          createdAt: unit.createdAt,
          status: activeLease ? "occupied" : "vacant",
          activeLease: activeLease
            ? {
                id: activeLease.id,
                tenantName: activeLease.tenant.fullName,
                startDate: activeLease.startDate,
                endDate: activeLease.endDate,
                rentAmount: activeLease.rentAmount,
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
        unitType: z.nativeEnum(UnitType),
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
          sizeSqm: input.sizeSqm ?? null,
        },
      });
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        unitNumber: z.string().min(1),
        unitType: z.nativeEnum(UnitType),
        sizeSqm: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const unit = await prisma.unit.findUnique({
        where: { id: input.id },
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
          sizeSqm: input.sizeSqm ?? null,
        },
      });
    }),

  getStatus: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const unit = await prisma.unit.findUnique({
        where: { id: input.id },
        include: { property: true },
      });

      if (!unit || unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      const now = new Date();
      const activeLease = await prisma.lease.findFirst({
        where: {
          unitId: unit.id,
          terminatedAt: null,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        include: {
          tenant: {
            select: { fullName: true },
          },
        },
      });

      return {
        status: activeLease ? "occupied" : "vacant",
        activeLease: activeLease
          ? {
              id: activeLease.id,
              tenantName: activeLease.tenant.fullName,
              startDate: activeLease.startDate,
              endDate: activeLease.endDate,
              rentAmount: activeLease.rentAmount,
            }
          : null,
      };
    }),

  createBulk: authedProcedure
    .input(
      z.object({
        propertyId: z.string().uuid(),
        units: z.array(
          z.object({
            unitNumber: z.string().min(1),
            unitType: z.nativeEnum(UnitType),
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
      }));

      await prisma.unit.createMany({
        data: createData,
      });

      return { count: createData.length };
    }),
});
