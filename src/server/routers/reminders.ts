import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { formatLagosYMD } from "@/lib/billing";

const EXPIRY_FREQUENCY_ALLOWED = ["once", "weekly", "monthly"] as const;
const EXPIRY_START_MODE_ALLOWED = ["months", "date"] as const;

export const remindersRouter = router({
  get: authedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "tenant") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only tenants have lease reminder settings.",
      });
    }

    const settings = await prisma.tenantReminderSetting.findUnique({
      where: { userId: ctx.user.id },
    });

    if (!settings) {
      return {
        expiryEnabled: true,
        expiryStartMode: "months" as const,
        expiryMonthsBefore: 2,
        expiryStartDate: null,
        expiryFrequency: "monthly" as const,
      };
    }

    return {
      expiryEnabled: settings.expiryEnabled,
      expiryStartMode: settings.expiryStartMode as "months" | "date",
      expiryMonthsBefore: settings.expiryMonthsBefore,
      expiryStartDate: settings.expiryStartDate
        ? new Date(settings.expiryStartDate).toISOString().split("T")[0]
        : null,
      expiryFrequency: settings.expiryFrequency as "once" | "weekly" | "monthly",
    };
  }),

  update: authedProcedure
    .input(
      z.object({
        expiryEnabled: z.boolean(),
        expiryStartMode: z.enum(EXPIRY_START_MODE_ALLOWED),
        expiryMonthsBefore: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(6),
        ]),
        expiryStartDate: z.string().nullable().optional(),
        expiryFrequency: z.enum(EXPIRY_FREQUENCY_ALLOWED),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "tenant") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only tenants can update lease reminder settings.",
        });
      }

      let parsedStartDate: Date | null = null;
      if (input.expiryStartMode === "date") {
        if (!input.expiryStartDate) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A start date is required when choosing a specific date.",
          });
        }
        const todayStr = formatLagosYMD(new Date());
        const selectedStr = formatLagosYMD(input.expiryStartDate);
        if (selectedStr < todayStr) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Start date must be today or in the future.",
          });
        }
        parsedStartDate = new Date(input.expiryStartDate);
      }

      const updated = await prisma.tenantReminderSetting.upsert({
        where: { userId: ctx.user.id },
        create: {
          userId: ctx.user.id,
          expiryEnabled: input.expiryEnabled,
          expiryStartMode: input.expiryStartMode,
          expiryMonthsBefore: input.expiryMonthsBefore,
          expiryStartDate: parsedStartDate,
          expiryFrequency: input.expiryFrequency,
        },
        update: {
          expiryEnabled: input.expiryEnabled,
          expiryStartMode: input.expiryStartMode,
          expiryMonthsBefore: input.expiryMonthsBefore,
          expiryStartDate: parsedStartDate,
          expiryFrequency: input.expiryFrequency,
        },
      });

      return {
        expiryEnabled: updated.expiryEnabled,
        expiryStartMode: updated.expiryStartMode as "months" | "date",
        expiryMonthsBefore: updated.expiryMonthsBefore,
        expiryStartDate: updated.expiryStartDate
          ? new Date(updated.expiryStartDate).toISOString().split("T")[0]
          : null,
        expiryFrequency: updated.expiryFrequency as "once" | "weekly" | "monthly",
      };
    }),
});
