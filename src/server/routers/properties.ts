import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { getUnitStatus } from "@/lib/leases";
import { PropertyType } from "@prisma/client";
import { canDeleteUnit, getUnitDeleteErrorMessage } from "@/lib/unit-delete";

export const propertiesRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const properties = await prisma.property.findMany({
      where: { landlordId: ctx.user.id, deletedAt: null },
      include: {
        units: {
          where: { deletedAt: null },
          include: {
            leases: {
              where: {
                status: { notIn: ["declined", "cancelled"] },
              },
              include: {
                tenant: {
                  select: {
                    fullName: true,
                  },
                },
                inviteCodes: {
                  select: {
                    code: true,
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
    });

    return properties.map((property) => {
      const totalUnits = property.units.length;
      const occupiedUnits = property.units.filter((u) => getUnitStatus(u.leases, now) === "occupied").length;
      const vacantUnits = totalUnits - occupiedUnits;

      return {
        id: property.id,
        name: property.name,
        address: property.address,
        city: property.city,
        state: property.state,
        propertyType: property.propertyType,
        landlordId: property.landlordId,
        createdAt: property.createdAt,
        expectedUnits: property.expectedUnits,
        units: property.units,
        stats: {
          totalUnits,
          occupiedUnits,
          vacantUnits,
        },
      };
    });
  }),

  // Fetch a single property owned by the authenticated landlord.
  // Use this on detail pages instead of properties.list to avoid loading all properties.
  getById: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const property = await prisma.property.findFirst({
        where: { id: input.id, landlordId: ctx.user.id, deletedAt: null },
        include: {
          units: {
            where: { deletedAt: null },
            include: {
              leases: {
                where: {
                  status: { notIn: ["declined", "cancelled"] },
                },
                include: {
                  tenant: { select: { fullName: true } },
                  inviteCodes: {
                    select: {
                      code: true,
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
      });

      if (!property) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Property not found or you do not own it.",
        });
      }

      const totalUnits = property.units.length;
      const occupiedUnits = property.units.filter((u) => getUnitStatus(u.leases, now) === "occupied").length;

      // Count distinct tenants who ever had an accepted lease in this property (current and past)
      // Exclude leases on deleted units
      const allAcceptedLeases = await prisma.lease.findMany({
        where: {
          unit: { propertyId: input.id, deletedAt: null, property: { deletedAt: null } },
          status: { notIn: ["declined", "cancelled", "pending"] },
        },
        select: { tenantId: true },
        distinct: ["tenantId"],
      });
      const tenantsSoFarCount = allAcceptedLeases.length;

      return {
        ...property,
        tenantsSoFarCount,
        stats: {
          totalUnits,
          occupiedUnits,
          vacantUnits: totalUnits - occupiedUnits,
        },
      };
    }),


  create: authedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        address: z.string().min(5),
        city: z.string().min(2),
        state: z.string().min(2),
        propertyType: z.nativeEnum(PropertyType),
        expectedUnits: z.number().int().positive().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await prisma.property.create({
        data: {
          landlordId: ctx.user.id,
          name: input.name,
          address: input.address,
          city: input.city,
          state: input.state,
          propertyType: input.propertyType,
          expectedUnits: input.expectedUnits ?? null,
        },
      });
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2),
        address: z.string().min(5),
        city: z.string().min(2),
        state: z.string().min(2),
        propertyType: z.nativeEnum(PropertyType),
        expectedUnits: z.number().int().positive().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const property = await prisma.property.findFirst({
        where: { id: input.id, deletedAt: null },
      });

      if (!property || property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this property.",
        });
      }

      return await prisma.property.update({
        where: { id: input.id },
        data: {
          name: input.name,
          address: input.address,
          city: input.city,
          state: input.state,
          propertyType: input.propertyType,
          expectedUnits: input.expectedUnits ?? null,
        },
      });
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const property = await prisma.property.findFirst({
        where: { id: input.id, deletedAt: null },
        include: {
          units: {
            where: { deletedAt: null },
            include: {
              leases: {
                include: {
                  tenant: { select: { fullName: true } },
                  inviteCodes: { select: { code: true, redeemedAt: true, expiresAt: true } },
                },
              },
            },
          },
        },
      });

      if (!property || property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this property.",
        });
      }

      // Every non-deleted unit must pass canDeleteUnit
      for (const unit of property.units) {
        const check = canDeleteUnit(unit.leases, now);
        if (!check.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: getUnitDeleteErrorMessage(unit.unitNumber, check),
          });
        }
      }

      const allLeaseIds = property.units.flatMap((u) => u.leases.map((l) => l.id));
      return await prisma.$transaction(async (tx) => {
        if (allLeaseIds.length > 0) {
          await tx.inviteCode.deleteMany({
            where: { leaseId: { in: allLeaseIds } },
          });
        }
        await tx.unit.updateMany({
          where: { propertyId: input.id, deletedAt: null },
          data: { deletedAt: now },
        });
        return await tx.property.update({
          where: { id: input.id },
          data: { deletedAt: now },
        });
      });
    }),
});
