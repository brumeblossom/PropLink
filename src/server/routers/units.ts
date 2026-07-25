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
});
