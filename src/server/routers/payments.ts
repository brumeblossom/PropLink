import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { PaymentMethod, PaymentStatus, Role } from "@prisma/client";
import { createNotification } from "../utils/notifications";
import { formatCurrency } from "@/lib/utils";
import { getRentPeriodForDate, getLeaseBalance, getPeriodStarts, formatLagosYMD } from "@/lib/billing";

export const paymentsRouter = router({
  // List all payments for a specific lease
  list: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: {
            include: { property: true },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lease not found.",
        });
      }

      if (lease.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payments cannot be logged against a pending, declined, or expired lease.",
        });
      }

      const isLandlord = ctx.user.role === Role.landlord && lease.unit.property.landlordId === ctx.user.id;
      const isTenant = ctx.user.role === Role.tenant && lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to view the payments for this lease.",
        });
      }

      return await prisma.payment.findMany({
        where: { leaseId: input.leaseId },
        orderBy: { paymentDate: "desc" },
        include: {
          recorder: {
            select: { fullName: true, role: true },
          },
        },
      });
    }),

  // Create a new payment record
  create: authedProcedure
    .input(
      z.object({
        leaseId: z.string().uuid(),
        amount: z.number().positive(),
        paymentDate: z.string(), // ISO String
        periodStart: z.string().optional(), // Optional for backwards-compatibility
        periodEnd: z.string().optional(),
        method: z.nativeEnum(PaymentMethod),
        notes: z.string().optional(),
        proofUrl: z.string().optional(),
        confirmUpcoming: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: {
            include: { property: true },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lease not found.",
        });
      }

      if (lease.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payments cannot be logged against a pending, declined, or expired lease.",
        });
      }

      const isLandlord = ctx.user.role === Role.landlord && lease.unit.property.landlordId === ctx.user.id;
      const isTenant = ctx.user.role === Role.tenant && lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to log a payment against this lease.",
        });
      }

      const payDate = new Date(input.paymentDate);
      const payDateStr = formatLagosYMD(payDate);
      const todayStr = formatLagosYMD(new Date());

      if (payDateStr > todayStr) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment date cannot be in the future.",
        });
      }

      const leaseStartStr = formatLagosYMD(lease.startDate);
      const isUpcoming = leaseStartStr > todayStr;

      if (isUpcoming) {
        if (!isLandlord) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot log payment for a lease that has not started yet.",
          });
        }
        if (!input.confirmUpcoming) {
          const runningLease = await prisma.lease.findFirst({
            where: {
              unitId: lease.unitId,
              id: { not: lease.id },
              terminatedAt: null,
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            },
          });
          if (runningLease) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This lease has not started yet. Please select the current lease or explicitly confirm logging against the upcoming lease.",
            });
          }
        }
      }

      // Check remaining lease rent limit
      const confirmedPayments = await prisma.payment.findMany({
        where: {
          leaseId: input.leaseId,
          status: PaymentStatus.confirmed,
        },
      });
      const pendingPayments = await prisma.payment.findMany({
        where: {
          leaseId: input.leaseId,
          status: PaymentStatus.pending,
        },
      });
      const balance = getLeaseBalance(lease, confirmedPayments, new Date(), pendingPayments);

      if (balance.isRentSet && input.amount > balance.remainingLeaseRent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This is more than the ${formatCurrency(balance.remainingLeaseRent)} left on this lease.`,
        });
      }

      const { periodStart: computedStart, periodEnd: computedEnd } = getRentPeriodForDate(lease, payDate);

      const status = isLandlord ? PaymentStatus.confirmed : PaymentStatus.pending;
      const confirmedBy = isLandlord ? ctx.user.id : null;
      const confirmedAt = isLandlord ? new Date() : null;

      const payment = await prisma.payment.create({
        data: {
          leaseId: input.leaseId,
          amount: input.amount,
          paymentDate: payDate,
          periodStart: computedStart,
          periodEnd: computedEnd,
          method: input.method,
          notes: input.notes || null,
          proofUrl: input.proofUrl || null,
          status,
          recordedBy: ctx.user.id,
          recordedByRole: ctx.user.role,
          confirmedBy,
          confirmedAt,
        },
      });

      // If tenant: notify landlord via In-App (create NotificationLog record and system Notification)
      if (isTenant) {
        try {
          await prisma.notificationLog.create({
            data: {
              recipientId: lease.unit.property.landlordId,
              channel: "in_app",
              relatedType: "notice",
              relatedId: payment.id,
              status: "sent",
              sentAt: new Date(),
            },
          });

          await createNotification({
            recipientId: lease.unit.property.landlordId,
            type: "payment_logged",
            title: "New Payment Logged",
            body: `${ctx.user.fullName} logged a payment of ${formatCurrency(input.amount)} for unit ${lease.unit.unitNumber}.`,
            relatedType: "payment",
            relatedId: payment.id,
          });
        } catch (err) {
          console.error("Failed to create in-app notification:", err);
        }
      }

      return payment;
    }),

  updatePending: authedProcedure
    .input(
      z.object({
        paymentId: z.string().uuid(),
        amount: z.number().positive(),
        paymentDate: z.string(), // ISO String
        periodStart: z.string().optional(),
        periodEnd: z.string().optional(),
        method: z.nativeEnum(PaymentMethod),
        notes: z.string().optional(),
        proofUrl: z.string().optional(),
        confirmUpcoming: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          lease: {
            include: {
              unit: {
                include: { property: true },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found.",
        });
      }

      if (payment.status !== PaymentStatus.pending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending payments can be edited.",
        });
      }

      if (payment.recordedBy !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only edit payments that you logged.",
        });
      }

      const lease = payment.lease;
      const isLandlord = lease.unit.property.landlordId === ctx.user.id;

      const payDate = new Date(input.paymentDate);
      const payDateStr = formatLagosYMD(payDate);
      const todayStr = formatLagosYMD(new Date());

      if (payDateStr > todayStr) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment date cannot be in the future.",
        });
      }

      const leaseStartStr = formatLagosYMD(lease.startDate);
      const isUpcoming = leaseStartStr > todayStr;

      if (isUpcoming) {
        if (!isLandlord) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot log payment for a lease that has not started yet.",
          });
        }
        if (!input.confirmUpcoming) {
          const runningLease = await prisma.lease.findFirst({
            where: {
              unitId: lease.unitId,
              id: { not: lease.id },
              terminatedAt: null,
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            },
          });
          if (runningLease) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This lease has not started yet. Please select the current lease or explicitly confirm logging against the upcoming lease.",
            });
          }
        }
      }

      // Check remaining lease rent limit (excluding current payment's pending amount)
      const confirmedPayments = await prisma.payment.findMany({
        where: {
          leaseId: payment.leaseId,
          status: PaymentStatus.confirmed,
        },
      });
      const otherPendingPayments = await prisma.payment.findMany({
        where: {
          leaseId: payment.leaseId,
          status: PaymentStatus.pending,
          id: { not: payment.id },
        },
      });
      const balance = getLeaseBalance(payment.lease, confirmedPayments, new Date(), otherPendingPayments);

      if (balance.isRentSet && input.amount > balance.remainingLeaseRent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This is more than the ${formatCurrency(balance.remainingLeaseRent)} left on this lease.`,
        });
      }

      const { periodStart: computedStart, periodEnd: computedEnd } = getRentPeriodForDate(payment.lease, payDate);

      return await prisma.payment.update({
        where: { id: payment.id },
        data: {
          amount: input.amount,
          paymentDate: payDate,
          periodStart: computedStart,
          periodEnd: computedEnd,
          method: input.method,
          notes: input.notes || null,
          proofUrl: input.proofUrl || null,
        },
      });
    }),

  // Confirm a tenant-logged pending payment (Landlord only)
  confirm: authedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== Role.landlord) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only landlords can confirm payments.",
        });
      }

      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          lease: {
            include: {
              unit: {
                include: { property: true },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found.",
        });
      }

      if (payment.lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this property.",
        });
      }

      if (payment.status !== PaymentStatus.pending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending payments can be confirmed.",
        });
      }

      const confirmedPayments = await prisma.payment.findMany({
        where: {
          leaseId: payment.leaseId,
          status: PaymentStatus.confirmed,
        },
      });
      const confirmedAmount = confirmedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const periodStarts = getPeriodStarts(payment.lease);
      const totalLeaseRent = Number(payment.lease.rentAmount || 0) * periodStarts.length;

      if (payment.lease.rentAmount && confirmedAmount + Number(payment.amount) > totalLeaseRent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Confirming this payment would exceed the total lease rent of ${formatCurrency(totalLeaseRent)}.`,
        });
      }

      const updatedPayment = await prisma.payment.update({
        where: { id: input.paymentId },
        data: {
          status: PaymentStatus.confirmed,
          confirmedBy: ctx.user.id,
          confirmedAt: new Date(),
        },
      });

      try {
        await createNotification({
          recipientId: payment.lease.tenantId,
          type: "payment_confirmed",
          title: "Payment Confirmed",
          body: `Your payment of ${formatCurrency(Number(payment.amount))} has been confirmed by the landlord.`,
          relatedType: "payment",
          relatedId: payment.id,
        });
      } catch (err) {
        console.error("Failed to create payment confirmed notification:", err);
      }

      return updatedPayment;
    }),

  // Reject a tenant-logged pending payment (Landlord only)
  reject: authedProcedure
    .input(
      z.object({
        paymentId: z.string().uuid(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== Role.landlord) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only landlords can reject payments.",
        });
      }

      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          lease: {
            include: {
              unit: {
                include: { property: true },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found.",
        });
      }

      if (payment.lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this property.",
        });
      }

      if (payment.status !== PaymentStatus.pending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending payments can be rejected.",
        });
      }

      const updatedPayment = await prisma.payment.update({
        where: { id: input.paymentId },
        data: {
          status: PaymentStatus.disputed,
          disputeReason: input.reason,
        },
      });

      try {
        await createNotification({
          recipientId: payment.lease.tenantId,
          type: "payment_rejected",
          title: "Payment Rejected",
          body: `Your payment of ${formatCurrency(Number(payment.amount))} has been rejected/disputed: ${input.reason}.`,
          relatedType: "payment",
          relatedId: payment.id,
        });
      } catch (err) {
        console.error("Failed to create payment rejected notification:", err);
      }

      return updatedPayment;
    }),

  // Acknowledge a landlord-logged payment (Tenant only)
  acknowledge: authedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== Role.tenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only tenants can acknowledge payments.",
        });
      }

      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        include: { lease: true },
      });

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found.",
        });
      }

      if (payment.lease.tenantId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not linked to this lease.",
        });
      }

      if (payment.recordedByRole !== Role.landlord) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can only acknowledge payments logged by your landlord.",
        });
      }

      return await prisma.payment.update({
        where: { id: input.paymentId },
        data: {
          counterVerifiedBy: ctx.user.id,
          counterVerifiedAt: new Date(),
        },
      });
    }),

  // Flag a landlord-logged payment as incorrect (Tenant only)
  flag: authedProcedure
    .input(
      z.object({
        paymentId: z.string().uuid(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== Role.tenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only tenants can flag payments.",
        });
      }

      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          lease: {
            include: {
              unit: {
                include: {
                  property: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found.",
        });
      }

      if (payment.lease.tenantId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not linked to this lease.",
        });
      }

      if (payment.recordedByRole !== Role.landlord) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can only flag payments logged by your landlord.",
        });
      }

      const updatedPayment = await prisma.payment.update({
        where: { id: input.paymentId },
        data: {
          disputedByTenant: true,
          disputedByReason: input.reason,
          disputedByResolvedAt: null, // Reset if re-flagged
        },
      });

      try {
        await createNotification({
          recipientId: payment.lease.unit.property.landlordId,
          type: "payment_flagged",
          title: "Payment Flagged by Tenant",
          body: `${ctx.user.fullName} flagged a payment of ${formatCurrency(Number(payment.amount))} as incorrect.`,
          relatedType: "payment",
          relatedId: payment.id,
        });
      } catch (err) {
        console.error("Failed to create payment flagged notification:", err);
      }

      return updatedPayment;
    }),

  // Edit or void a tenant-flagged dispute on landlord-logged payment (Landlord only)
  resolve: authedProcedure
    .input(
      z.object({
        paymentId: z.string().uuid(),
        action: z.enum(["edit", "void"]),
        amount: z.number().positive().optional(),
        paymentDate: z.string().optional(),
        method: z.nativeEnum(PaymentMethod).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== Role.landlord) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only landlords can resolve payment disputes.",
        });
      }

      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          lease: {
            include: {
              unit: {
                include: { property: true },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found.",
        });
      }

      if (payment.lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this property.",
        });
      }

      if (!payment.disputedByTenant) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payment is not flagged as disputed by the tenant.",
        });
      }

      let updatedPayment;
      if (input.action === "void") {
        updatedPayment = await prisma.payment.update({
          where: { id: input.paymentId },
          data: {
            status: PaymentStatus.disputed,
            disputeReason: `Voided by landlord after tenant flag: ${payment.disputedByReason}`,
            disputedByResolvedAt: new Date(),
          },
        });
      } else {
        if (!input.amount || !input.paymentDate || !input.method) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Amount, payment date, and payment method are required when editing.",
          });
        }

        const payDate = new Date(input.paymentDate);
        const payDateStr = formatLagosYMD(payDate);
        const todayStr = formatLagosYMD(new Date());

        if (payDateStr > todayStr) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Payment date cannot be in the future.",
          });
        }

        const { periodStart: computedStart, periodEnd: computedEnd } = getRentPeriodForDate(payment.lease, payDate);

        updatedPayment = await prisma.payment.update({
          where: { id: input.paymentId },
          data: {
            amount: input.amount,
            paymentDate: payDate,
            periodStart: computedStart,
            periodEnd: computedEnd,
            method: input.method,
            disputedByTenant: false,
            disputedByReason: null,
            disputedByResolvedAt: new Date(),
          },
        });
      }

      try {
        await createNotification({
          recipientId: payment.lease.tenantId,
          type: "payment_resolved",
          title: "Disputed Payment Resolved",
          body: `The landlord resolved the dispute for your payment of ${formatCurrency(Number(payment.amount))}.`,
          relatedType: "payment",
          relatedId: payment.id,
        });
      } catch (err) {
        console.error("Failed to create payment resolved notification:", err);
      }

      return updatedPayment;
    }),

  // Get signed upload URL for payment proof (both roles)
  getUploadUrl: authedProcedure
    .input(
      z.object({
        leaseId: z.string().uuid(),
        fileName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: {
            include: { property: true },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lease not found.",
        });
      }

      if (lease.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payments cannot be logged against a pending, declined, or expired lease.",
        });
      }

      const isLandlord = ctx.user.role === Role.landlord && lease.unit.property.landlordId === ctx.user.id;
      const isTenant = ctx.user.role === Role.tenant && lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to upload documents for this lease.",
        });
      }

      const fileExtension = input.fileName.split(".").pop() || "pdf";
      const filePath = `${input.leaseId}/${Date.now()}.${fileExtension}`;

      const { data, error } = await ctx.supabase.storage
        .from("leases")
        .createSignedUploadUrl(filePath);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create signed upload URL: ${error.message}`,
        });
      }

      return {
        signedUrl: data.signedUrl,
        path: filePath,
      };
    }),

  // Get signed download URL for payment proof (both roles)
  getDownloadUrl: authedProcedure
    .input(z.object({ path: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const pathParts = input.path.split("/");
      const leaseId = pathParts[0] === "payments" ? pathParts[1] : pathParts[0];
      if (!leaseId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid payment proof file path format.",
        });
      }

      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
        include: {
          unit: {
            include: { property: true },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lease associated with payment proof not found.",
        });
      }

      const isLandlord = ctx.user.role === Role.landlord && lease.unit.property.landlordId === ctx.user.id;
      const isTenant = ctx.user.role === Role.tenant && lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to download this file.",
        });
      }

      const { data, error } = await ctx.supabase.storage
        .from("leases")
        .createSignedUrl(input.path, 60);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create signed download URL: ${error.message}`,
        });
      }

      return {
        signedUrl: data.signedUrl,
      };
    }),

  // Delete payment proof (recorder while pending, or reviewing landlord while pending)
  deleteProof: authedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          lease: {
            include: {
              unit: {
                include: { property: true },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found.",
        });
      }

      if (!payment.proofUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No proof found to delete.",
        });
      }

      if (payment.status !== PaymentStatus.pending) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Proof is locked because this payment is confirmed.",
        });
      }

      const isRecorder = payment.recordedBy === ctx.user.id;
      const isLandlord =
        ctx.user.role === Role.landlord &&
        payment.lease.unit.property.landlordId === ctx.user.id;

      if (!isRecorder && !isLandlord) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to delete the proof for this payment.",
        });
      }

      const { error } = await ctx.supabase.storage
        .from("leases")
        .remove([payment.proofUrl]);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete payment proof from storage: ${error.message}`,
        });
      }

      await prisma.payment.update({
        where: { id: input.paymentId },
        data: { proofUrl: null },
      });

      return {
        success: true,
      };
    }),

  // Attach/replace proof on a pending payment
  attachProof: authedProcedure
    .input(
      z.object({
        paymentId: z.string().uuid(),
        proofUrl: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          lease: {
            include: {
              unit: {
                include: { property: true },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found.",
        });
      }

      if (payment.status !== PaymentStatus.pending) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Proof is locked because this payment is confirmed.",
        });
      }

      const isRecorder = payment.recordedBy === ctx.user.id;
      const isLandlord =
        ctx.user.role === Role.landlord &&
        payment.lease.unit.property.landlordId === ctx.user.id;

      if (!isRecorder && !isLandlord) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to upload proof for this payment.",
        });
      }

      return await prisma.payment.update({
        where: { id: input.paymentId },
        data: { proofUrl: input.proofUrl },
      });
    }),

  // Get current period billing summary (rent, paid, outstanding)
  getBillingSummary: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: {
            include: { property: true },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lease not found.",
        });
      }

      if (lease.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payments cannot be logged against a pending, declined, or expired lease.",
        });
      }

      const isLandlord = ctx.user.role === Role.landlord && lease.unit.property.landlordId === ctx.user.id;
      const isTenant = ctx.user.role === Role.tenant && lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to view the billing summary for this lease.",
        });
      }

      const confirmedPayments = await prisma.payment.findMany({
        where: {
          leaseId: input.leaseId,
          status: PaymentStatus.confirmed,
        },
      });

      const pendingPayments = await prisma.payment.findMany({
        where: {
          leaseId: input.leaseId,
          status: PaymentStatus.pending,
        },
      });

      const balance = getLeaseBalance(lease, confirmedPayments, new Date(), pendingPayments);

      return {
        ...balance,
      };
    }),

  // Get redirect routing information for a payment
  getRedirectInfo: authedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const payment = await prisma.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          lease: {
            include: {
              unit: { select: { id: true, propertyId: true } }
            }
          }
        }
      });
      return payment
        ? {
            unitId: payment.lease.unit.id,
            propertyId: payment.lease.unit.propertyId,
            leaseId: payment.lease.id,
          }
        : null;
    }),
});
