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
        ...property,
        stats: {
          totalUnits,
          occupiedUnits,
          vacantUnits,
        },
      };
    });
  }),

  create: authedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        address: z.string().min(5),
        city: z.string().min(2),
        state: z.string().min(2),
        propertyType: z.nativeEnum(PropertyType),
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
