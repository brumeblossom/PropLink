import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { PropertyType } from "@prisma/client";

export const propertiesRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const properties = await prisma.property.findMany({
      where: { landlordId: ctx.user.id },
      include: {
        units: {
          where: { deletedAt: null },
          include: {
            leases: {
              where: {
                terminatedAt: null,
                startDate: { lte: now },
                endDate: { gte: now },
              },
              include: {
                tenant: {
                  select: {
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return properties.map((property) => {
      const totalUnits = property.units.length;
      const occupiedUnits = property.units.filter((u) => u.leases.length > 0).length;
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
        where: { id: input.id, landlordId: ctx.user.id },
        include: {
          units: {
            where: { deletedAt: null },
            include: {
              leases: {
                where: {
                  terminatedAt: null,
                  startDate: { lte: now },
                  endDate: { gte: now },
                },
                include: {
                  tenant: { select: { fullName: true } },
                },
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
      const occupiedUnits = property.units.filter((u) => u.leases.length > 0).length;

      return {
        ...property,
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
      const property = await prisma.property.findUnique({
        where: { id: input.id },
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
      const property = await prisma.property.findUnique({
        where: { id: input.id },
        include: {
          units: {
            where: { deletedAt: null },
            include: {
              leases: {
                where: {
                  terminatedAt: null,
                  startDate: { lte: now },
                  endDate: { gte: now },
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

      // Block deletion if any unit has an active lease
      const activeLeases = property.units.flatMap((u) => u.leases);
      if (activeLeases.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete a property with active leases. Please terminate active leases first.",
        });
      }

      return await prisma.property.delete({
        where: { id: input.id },
      });
    }),
});
