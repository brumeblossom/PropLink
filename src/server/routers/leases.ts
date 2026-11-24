import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { RentFrequency, Role } from "@prisma/client";
import { createNotification } from "../utils/notifications";
import { getLeaseBalance, getDueDateStatus, formatLagosYMD } from "@/lib/billing";
import { getCurrentLease, getNextLease, getRenewEligibility } from "@/lib/leases";

export const leasesRouter = router({
  lookupTenantEmail: authedProcedure
    .input(z.object({ email: z.string().trim() }))
    .query(async ({ input }) => {
      const email = input.email.toLowerCase().trim();
      if (!email || !email.includes("@")) {
        return { exists: false, isLandlord: false, isTenant: false, fullName: null };
      }
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, fullName: true },
      });
      if (!user) {
        return { exists: false, isLandlord: false, isTenant: false, fullName: null };
      }
      return {
        exists: true,
        isLandlord: user.role === "landlord",
        isTenant: user.role === "tenant",
        fullName: user.fullName,
      };
    }),

  create: authedProcedure
    .input(
      z.object({
        unitId: z.string().uuid(),
        tenantEmail: z.string().trim().email("A valid email address is required"),
        tenantName: z.string().trim().min(1, "Tenant full name is required"),
        startDate: z.string().optional().nullable(),
        endDate: z.string().optional().nullable(),
        rentAmount: z.number().positive("Enter the rent amount"),
        rentFrequency: z.nativeEnum(RentFrequency, {
          errorMap: () => ({ message: "Choose how often rent is paid" }),
        }),
        depositAmount: z.number().positive().optional().nullable(),
        renewalWindowDays: z.number().int().positive().default(60),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const unit = await prisma.unit.findUnique({
        where: { id: input.unitId },
        include: { property: true },
      });

      if (!unit || unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit's parent property.",
        });
      }

      const start = input.startDate ? new Date(input.startDate) : new Date();
      const end = input.endDate
        ? new Date(input.endDate)
        : new Date(new Date(start).setFullYear(start.getFullYear() + 1));

      if (start >= end) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Start date must be before end date.",
        });
      }

      // Check for overlapping active or pending leases for this unit
      const overlap = await prisma.lease.findFirst({
        where: {
          unitId: input.unitId,
          terminatedAt: null,
          OR: [
            { status: "active" },
            {
              status: "pending",
              OR: [
                { invitationExpiresAt: null },
                { invitationExpiresAt: { gte: new Date() } },
              ],
            },
          ],
          NOT: {
            OR: [{ endDate: { lt: start } }, { startDate: { gt: end } }],
          },
        },
        include: {
          tenant: {
            select: { fullName: true },
          },
        },
      });

      if (overlap) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This unit already has an active lease for ${
            overlap.tenant.fullName
          } from ${new Date(overlap.startDate).toLocaleDateString()} to ${new Date(
            overlap.endDate
          ).toLocaleDateString()}.`,
        });
      }

      const normalizedEmail = input.tenantEmail.toLowerCase().trim();
      let tenant = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (tenant?.role === "landlord") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This email belongs to a landlord account. Use the tenant's personal email.",
        });
      }

      const isExistingTenant = Boolean(tenant && tenant.role === "tenant");

      if (!tenant) {
        tenant = await prisma.user.create({
          data: {
            email: normalizedEmail,
            fullName: input.tenantName,
            role: "tenant",
          },
        });
      }

      const now = new Date();
      // Create the lease record: status pending for existing tenants, active for new placeholder accounts
      const lease = await prisma.lease.create({
        data: {
          unitId: input.unitId,
          tenantId: tenant.id,
          startDate: start,
          endDate: end,
          rentAmount: input.rentAmount,
          rentFrequency: input.rentFrequency,
          depositAmount: input.depositAmount ?? null,
          renewalWindowDays: input.renewalWindowDays,
          status: isExistingTenant ? "pending" : "active",
          invitedAt: isExistingTenant ? now : null,
          invitationExpiresAt: isExistingTenant
            ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
            : null,
        },
      });

      // Generate a one-time invite code only if this is a newly created placeholder tenant
      let inviteCode = null;
      if (!isExistingTenant) {
        const code = "PL-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 14); // valid for 14 days

        inviteCode = await prisma.inviteCode.create({
          data: {
            leaseId: lease.id,
            code,
            expiresAt,
          },
        });
      }

      if (isExistingTenant) {
        try {
          await createNotification({
            recipientId: tenant.id,
            type: "lease_invitation",
            title: "New rental invitation",
            body: `${ctx.user.fullName || "Landlord"} invited you to rent ${unit.unitNumber} at ${unit.property.name}.`,
            relatedType: "lease",
            relatedId: lease.id,
          });
        } catch (err) {
          console.error("Failed to trigger lease notification:", err);
        }
      }

      return {
        lease,
        inviteCode: inviteCode ? inviteCode.code : null,
      };
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        rentAmount: z.number().nonnegative().optional(),
        rentFrequency: z.nativeEnum(RentFrequency).optional(),
        depositAmount: z.number().positive().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.id },
        include: { unit: { include: { property: true } } },
      });

      if (!lease || lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this lease's parent property.",
        });
      }

      return await prisma.lease.update({
        where: { id: input.id },
        data: {
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          rentAmount: input.rentAmount !== undefined ? input.rentAmount : undefined,
          rentFrequency: input.rentFrequency,
          depositAmount: input.depositAmount,
        },
      });
    }),

  getForUnit: authedProcedure
    .input(z.object({ unitId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const unit = await prisma.unit.findUnique({
        where: { id: input.unitId },
        include: { property: true },
      });

      if (!unit || unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      const leases = await prisma.lease.findMany({
        where: {
          unitId: input.unitId,
          status: { notIn: ["declined", "cancelled"] },
        },
        include: {
          tenant: {
            select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true },
          },
          inviteCodes: {
            select: {
              code: true,
              redeemedAt: true,
              expiresAt: true,
            },
          },
          payments: {
            select: { id: true },
          },
        },
        orderBy: { startDate: "desc" },
      });

      const today = new Date();
      const currentLease = getCurrentLease(leases, today);
      const nextLease = getNextLease(leases, today);

      const rawPending = leases.find(
        (l) => !l.terminatedAt && (l.status === "pending" || l.status === "expired")
      );
      const pendingLease = rawPending
        ? {
            ...rawPending,
            isExpired:
              rawPending.status === "expired" ||
              Boolean(
                rawPending.invitationExpiresAt &&
                  new Date(rawPending.invitationExpiresAt) < today
              ),
          }
        : null;

      return {
        leases,
        currentLease,
        nextLease,
        pendingLease,
      };
    }),

  resendInvitation: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: { include: { property: true } },
          tenant: true,
        },
      });

      if (!lease || lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      if (lease.status !== "pending" && lease.status !== "expired") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending or expired invitations can be resent.",
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const updated = await prisma.lease.update({
        where: { id: lease.id },
        data: {
          status: "pending",
          invitedAt: now,
          invitationExpiresAt: expiresAt,
        },
      });

      try {
        await createNotification({
          recipientId: lease.tenantId,
          type: "lease_invitation",
          title: "New rental invitation",
          body: `${ctx.user.fullName || "Landlord"} invited you to rent ${lease.unit.unitNumber} at ${lease.unit.property.name}.`,
          relatedType: "lease",
          relatedId: lease.id,
        });
      } catch (err) {
        console.error("Failed to resend lease invitation notification:", err);
      }

      return updated;
    }),

  cancelInvitation: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: { include: { property: true } },
        },
      });

      if (!lease || lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      if (lease.status !== "pending" && lease.status !== "expired") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending or expired invitations can be cancelled.",
        });
      }

      const updated = await prisma.lease.update({
        where: { id: lease.id },
        data: {
          status: "cancelled",
          respondedAt: new Date(),
        },
      });

      await prisma.notification.deleteMany({
        where: {
          type: "lease_invitation",
          relatedType: "lease",
          relatedId: lease.id,
        },
      }).catch((err) => console.error("Failed to delete invitation notification on cancel:", err));

      return updated;
    }),

  regenerateInviteCode: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: { include: { property: true } },
          inviteCodes: true,
          tenant: true,
        },
      });

      if (!lease || lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      const isRedeemed = lease.inviteCodes.some((c) => c.redeemedAt !== null);
      if (isRedeemed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot regenerate code for an already redeemed invite.",
        });
      }

      // Delete unredeemed codes
      await prisma.inviteCode.deleteMany({
        where: { leaseId: lease.id, redeemedAt: null },
      });

      const code = "PL-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      const newInvite = await prisma.inviteCode.create({
        data: {
          leaseId: lease.id,
          code,
          expiresAt,
        },
      });

      return {
        code: newInvite.code,
        expiresAt: newInvite.expiresAt,
        tenantName: lease.tenant.fullName,
      };
    }),

  updatePlaceholderTenant: authedProcedure
    .input(
      z.object({
        leaseId: z.string().uuid(),
        fullName: z.string().trim().min(1, "Tenant full name is required"),
        email: z.string().trim().email("Please enter a valid email address"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: { include: { property: true } },
          inviteCodes: true,
          tenant: true,
        },
      });

      if (!lease || lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      const isRedeemed = lease.inviteCodes.some((c) => c.redeemedAt !== null);
      if (isRedeemed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit tenant details after the invite has been redeemed.",
        });
      }

      const normalizedEmail = input.email.toLowerCase().trim();
      if (normalizedEmail !== lease.tenant.email.toLowerCase()) {
        const existingUser = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (existingUser && existingUser.id !== lease.tenantId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This email already has a PropLink account. Cancel this invite and invite them again.",
          });
        }
      }

      const updatedUser = await prisma.user.update({
        where: { id: lease.tenantId },
        data: {
          fullName: input.fullName.trim(),
          email: normalizedEmail,
        },
      });

      return {
        fullName: updatedUser.fullName,
        email: updatedUser.email,
      };
    }),

  cancelCodeInvite: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: { include: { property: true } },
          inviteCodes: true,
          tenant: true,
          documents: true,
          payments: { select: { id: true } },
        },
      });

      if (!lease || lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      if (lease.payments.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This lease has payments. Delete them first.",
        });
      }

      const isRedeemed = lease.inviteCodes.some((c) => c.redeemedAt !== null);
      if (isRedeemed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot cancel an invite that has already been redeemed.",
        });
      }

      // Remove files from storage
      const filePaths: string[] = [];
      if (lease.documentUrl) filePaths.push(lease.documentUrl);
      lease.documents.forEach((d) => {
        if (d.path) filePaths.push(d.path);
      });

      if (filePaths.length > 0) {
        try {
          await ctx.supabase.storage.from("leases").remove(filePaths);
        } catch (err) {
          console.error("Failed to remove lease documents from storage:", err);
        }
      }

      const tenantId = lease.tenantId;

      await prisma.$transaction(async (tx) => {
        await tx.notification.deleteMany({
          where: { relatedType: "lease", relatedId: lease.id },
        });
        await tx.leaseDocument.deleteMany({
          where: { leaseId: lease.id },
        });
        await tx.inviteCode.deleteMany({
          where: { leaseId: lease.id },
        });
        await tx.lease.delete({
          where: { id: lease.id },
        });

        const otherLeases = await tx.lease.count({
          where: { tenantId },
        });
        if (otherLeases === 0) {
          const paymentCount = await tx.payment.count({
            where: { lease: { tenantId } },
          });
          if (paymentCount === 0) {
            await tx.user.delete({
              where: { id: tenantId },
            });
          }
        }
      });

      return { success: true };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.id },
        include: { unit: { include: { property: true } } },
      });

      if (!lease || lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this lease's parent property.",
        });
      }

      await prisma.notification.deleteMany({
        where: {
          relatedType: "lease",
          relatedId: input.id,
        },
      }).catch((err) => console.error("Failed to delete notifications on lease delete:", err));

      return await prisma.lease.delete({
        where: { id: input.id },
      });
    }),

  getTimeline: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: {
            include: { property: true },
          },
          tenant: {
            select: { fullName: true, email: true },
          },
          inviteCodes: {
            select: { code: true, redeemedAt: true, expiresAt: true },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lease not found.",
        });
      }

      const isLandlord = lease.unit.property.landlordId === ctx.user.id;
      const isTenant = lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this lease timeline.",
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const start = new Date(lease.startDate);
      const end = new Date(lease.endDate);

      let status: "terminated" | "upcoming" | "active" | "ended" | "moved_out" = "active";

      if (lease.terminatedAt) {
        status = "moved_out";
      } else if (today < start) {
        status = "upcoming";
      } else if (today >= end) {
        status = "ended";
      } else {
        status = "active";
      }

      return {
        id: lease.id,
        unitNumber: lease.unit.unitNumber,
        propertyName: lease.unit.property.name,
        tenantName: lease.tenant.fullName,
        startDate: lease.startDate,
        endDate: lease.endDate,
        rentAmount: lease.rentAmount,
        rentFrequency: lease.rentFrequency,
        renewalWindowDays: lease.renewalWindowDays,
        renewalStartDate: end,
        terminatedAt: lease.terminatedAt,
        status,
        today,
        inviteCodes: lease.inviteCodes,
      };
    }),

  uploadDocument: authedProcedure
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

      if (!lease || lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this lease parent property.",
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

      // Update DB with the document location reference
      await prisma.lease.update({
        where: { id: input.leaseId },
        data: { documentUrl: filePath },
      });

      return {
        signedUrl: data.signedUrl,
        path: filePath,
      };
    }),

  getDocumentUrl: authedProcedure
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

      const isLandlord = lease.unit.property.landlordId === ctx.user.id;
      const isTenant = lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied.",
        });
      }

      if (!lease.documentUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No document has been uploaded for this lease.",
        });
      }

      const { data, error } = await ctx.supabase.storage
        .from("leases")
        .createSignedUrl(lease.documentUrl, 60); // valid for 60 seconds

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

  deleteDocument: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
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

      if (ctx.user.role !== Role.landlord || lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the landlord of this lease can delete lease documents.",
        });
      }

      if (!lease.documentUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No document has been uploaded for this lease.",
        });
      }

      const { error } = await ctx.supabase.storage
        .from("leases")
        .remove([lease.documentUrl]);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete lease document from storage: ${error.message}`,
        });
      }

      await prisma.lease.update({
        where: { id: input.leaseId },
        data: { documentUrl: null },
      });

      return {
        success: true,
      };
    }),

  getPendingInvitations: authedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "tenant") {
        return [];
      }

      const now = new Date();
      return await prisma.lease.findMany({
        where: {
          tenantId: ctx.user.id,
          status: "pending",
          OR: [
            { invitationExpiresAt: null },
            { invitationExpiresAt: { gt: now } },
          ],
        },
        include: {
          unit: {
            include: {
              property: {
                include: {
                  landlord: {
                    select: {
                      id: true,
                      fullName: true,
                      email: true,
                      phone: true,
                      avatarUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { invitedAt: "desc" },
      });
    }),

  acceptInvitation: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "tenant") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only tenants can accept invitations.",
        });
      }

      const lease = await prisma.lease.findFirst({
        where: {
          id: input.leaseId,
          tenantId: ctx.user.id,
        },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found.",
        });
      }

      if (lease.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This invitation cannot be accepted (current status: ${lease.status}).`,
        });
      }

      if (lease.invitationExpiresAt && new Date(lease.invitationExpiresAt) < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has expired.",
        });
      }

      await prisma.lease.update({
        where: { id: lease.id },
        data: {
          status: "active",
          respondedAt: new Date(),
        },
      });

      try {
        await createNotification({
          recipientId: lease.unit.property.landlordId,
          type: "lease_invitation_accepted",
          title: "Invitation accepted",
          body: `${ctx.user.fullName || "Tenant"} accepted your invitation for ${lease.unit.unitNumber}.`,
          relatedType: "lease",
          relatedId: lease.id,
        });
      } catch (err) {
        console.error("Failed to notify landlord of accepted invitation:", err);
      }

      return { success: true, unitNumber: lease.unit.unitNumber };
    }),

  declineInvitation: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "tenant") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only tenants can decline invitations.",
        });
      }

      const lease = await prisma.lease.findFirst({
        where: {
          id: input.leaseId,
          tenantId: ctx.user.id,
        },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found.",
        });
      }

      if (lease.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This invitation cannot be declined (current status: ${lease.status}).`,
        });
      }

      await prisma.lease.update({
        where: { id: lease.id },
        data: {
          status: "declined",
          respondedAt: new Date(),
        },
      });

      await prisma.notification.deleteMany({
        where: {
          type: "lease_invitation",
          relatedType: "lease",
          relatedId: lease.id,
        },
      }).catch((err) => console.error("Failed to delete invitation notification on decline:", err));

      try {
        await createNotification({
          recipientId: lease.unit.property.landlordId,
          type: "lease_invitation_declined",
          title: "Invitation declined",
          body: `${ctx.user.fullName || "Tenant"} declined your invitation for ${lease.unit.unitNumber}.`,
          relatedType: "lease",
          relatedId: lease.id,
        });
      } catch (err) {
        console.error("Failed to notify landlord of declined invitation:", err);
      }

      return { success: true };
    }),

  getMine: authedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "tenant") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only tenants can view their leases.",
        });
      }

      return await prisma.lease.findMany({
        where: {
          tenantId: ctx.user.id,
          status: { in: ["active", "expired"] },
        },
        include: {
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              paymentDate: true,
            },
          },
          unit: {
            include: {
              property: {
                include: {
                  landlord: {
                    select: {
                      id: true,
                      fullName: true,
                      email: true,
                      phone: true,
                      avatarUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { startDate: "desc" },
      });
    }),

  getTenantRental: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "tenant") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only tenants can view rental details.",
        });
      }

      const lease = await prisma.lease.findFirst({
        where: {
          id: input.leaseId,
          tenantId: ctx.user.id,
          status: { in: ["active", "expired"] },
        },
        include: {
          unit: {
            include: {
              property: {
                include: {
                  landlord: {
                    select: {
                      id: true,
                      fullName: true,
                      email: true,
                      phone: true,
                      avatarUrl: true,
                    },
                  },
                },
              },
              leases: {
                where: {
                  tenantId: ctx.user.id,
                  status: { in: ["active", "expired"] },
                },
                orderBy: { startDate: "desc" },
                select: {
                  id: true,
                  startDate: true,
                  endDate: true,
                  rentAmount: true,
                  rentFrequency: true,
                  depositAmount: true,
                  terminatedAt: true,
                  renewalWindowDays: true,
                },
              },
            },
          },
          documents: {
            orderBy: { createdAt: "desc" },
          },
          payments: {
            orderBy: { paymentDate: "desc" },
          },
        },
      });

      if (!lease) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Rental not found.",
        });
      }

      return lease;
    }),

  renew: authedProcedure
    .input(
      z.object({
        sourceLeaseId: z.string().uuid(),
        startDate: z.string().optional(),
        endDate: z.string(),
        rentAmount: z.number().nonnegative(),
        rentFrequency: z.nativeEnum(RentFrequency).default(RentFrequency.annually),
        depositAmount: z.number().positive().optional().nullable(),
        renewalWindowDays: z.number().int().positive().default(60),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch the source lease with payments and all leases for the unit
      const sourceLease = await prisma.lease.findUnique({
        where: { id: input.sourceLeaseId },
        include: {
          unit: {
            include: {
              property: true,
              leases: {
                where: {
                  status: { notIn: ["declined", "cancelled"] },
                },
              },
            },
          },
          tenant: { select: { fullName: true, email: true } },
          payments: {
            where: { status: "confirmed" },
            select: { amount: true, status: true },
          },
        },
      });

      if (!sourceLease) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source lease not found." });
      }

      // 2. Auth: landlord must own the property
      if (sourceLease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this lease's parent property.",
        });
      }

      const today = new Date();
      const eligibility = getRenewEligibility(
        sourceLease,
        sourceLease.payments,
        today,
        sourceLease.unit.leases
      );

      if (!eligibility.eligible) {
        let msg = "Lease is not eligible for renewal.";
        if (eligibility.reason === "not_ended") {
          msg = "Renewal is only allowed on or after the lease end date.";
        } else if (eligibility.reason === "unpaid") {
          msg = `₦${(eligibility.unpaidAmount ?? 0).toLocaleString()} still unpaid on this lease.`;
        } else if (eligibility.reason === "moved_out") {
          msg = "Tenant has already moved out.";
        } else if (eligibility.reason === "has_later_lease") {
          msg = "A newer lease already exists on this unit.";
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: msg,
        });
      }

      const start = new Date(sourceLease.endDate);
      const end = new Date(input.endDate);

      if (start >= end) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Renewal end date must be after the start date.",
        });
      }

      // 3. Mark source lease as expired so overlap check allows the new lease
      await prisma.lease.update({
        where: { id: sourceLease.id },
        data: { status: "expired" },
      });

      // 4. Create the new lease — tenant linked directly, status active
      const newLease = await prisma.lease.create({
        data: {
          unitId: sourceLease.unitId,
          tenantId: sourceLease.tenantId,
          startDate: start,
          endDate: end,
          rentAmount: input.rentAmount,
          rentFrequency: input.rentFrequency,
          depositAmount: input.depositAmount ?? null,
          renewalWindowDays: input.renewalWindowDays,
          status: "active",
        },
      });

      return { lease: newLease };
    }),

  markMovedOut: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: { include: { property: true } },
          tenant: true,
        },
      });

      if (!lease) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lease not found." });
      }

      if (lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not own this unit.",
        });
      }

      const today = new Date();
      const todayStr = formatLagosYMD(today);
      const endStr = formatLagosYMD(lease.endDate);

      if (todayStr < endStr) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot mark as moved out before the lease end date.",
        });
      }

      if (lease.terminatedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant is already marked as moved out.",
        });
      }

      const updated = await prisma.lease.update({
        where: { id: lease.id },
        data: {
          terminatedAt: new Date(),
        },
      });

      try {
        await createNotification({
          recipientId: lease.tenantId,
          type: "lease_invitation_declined", // General notice
          title: "Moved out status updated",
          body: `${ctx.user.fullName || "Landlord"} marked you as moved out of ${lease.unit.unitNumber} at ${lease.unit.property.name}.`,
          relatedType: "lease",
          relatedId: lease.id,
        });
      } catch (err) {
        console.error("Failed to notify tenant of move-out:", err);
      }

      return updated;
    }),

  // Get redirect routing information for a lease
  getRedirectInfo: authedProcedure
    .input(z.object({ leaseId: z.string().uuid() }))
    .query(async ({ input }) => {
      const lease = await prisma.lease.findUnique({
        where: { id: input.leaseId },
        include: {
          unit: { select: { id: true, propertyId: true } }
        }
      });
      return lease ? { unitId: lease.unit.id, propertyId: lease.unit.propertyId } : null;
    }),

  getLandlordTenants: authedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        propertyId: z.string().uuid().optional(),
        status: z.enum(["active", "past", "all"]).optional().default("all"),
        leaseStatus: z.enum(["active", "ended", "moved_out"]).optional(),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(1).max(100).optional().default(25),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const landlordProperties = await prisma.property.findMany({
        where: { landlordId: ctx.user.id },
        select: { id: true, name: true },
      });
      const propertyIds = landlordProperties.map((p) => p.id);
      if (propertyIds.length === 0) {
        return { rows: [], total: 0 };
      }

      if (input?.propertyId && !propertyIds.includes(input.propertyId)) {
        return { rows: [], total: 0 };
      }

      const activePropertyFilter = input?.propertyId
        ? input.propertyId
        : { in: propertyIds };

      const searchTrimmed = input?.search?.trim();

      const users = await prisma.user.findMany({
        where: {
          leasesAsTenant: {
            some: {
              unit: {
                propertyId: activePropertyFilter,
              },
            },
          },
          ...(searchTrimmed
            ? {
                OR: [
                  { fullName: { contains: searchTrimmed, mode: "insensitive" } },
                  { email: { contains: searchTrimmed, mode: "insensitive" } },
                  { phone: { contains: searchTrimmed, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          leasesAsTenant: {
            where: {
              unit: {
                propertyId: activePropertyFilter,
              },
            },
            include: {
              unit: {
                include: {
                  property: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
              payments: {
                select: {
                  amount: true,
                  status: true,
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
            orderBy: {
              startDate: "desc",
            },
          },
        },
        orderBy: {
          fullName: "asc",
        },
      });

      const today = new Date();
      const todayStr = formatLagosYMD(today);

      const computedTenants = users.map((user) => {
        // Group leases by unitId
        const leasesByUnit = new Map<string, typeof user.leasesAsTenant>();
        for (const lease of user.leasesAsTenant) {
          const list = leasesByUnit.get(lease.unitId) || [];
          list.push(lease);
          leasesByUnit.set(lease.unitId, list);
        }

        const processedUnits = [];
        const allProcessedLeases: Array<{
          id: string;
          unitId: string;
          unitName: string;
          propertyId: string;
          propertyName: string;
          startDate: string;
          endDate: string;
          rentAmount: number;
          rentFrequency: string;
          leaseStatus: "active" | "ended" | "moved_out" | "upcoming" | "pending" | "invite_sent" | "invite_expired";
          nextDueDate: string | null;
          unpaidPeriods: number;
          nextDueStatus: "overdue" | "today" | "upcoming" | "paid_in_full" | "pending";
          nextDueText: string;
          totalLeaseRent: number;
          totalPaid: number;
          outstanding: number;
          inviteCode: string | null;
          inviteExpiresAt: string | null;
          isCodeInvite: boolean;
          hasPayments: boolean;
        }> = [];

        for (const unitLeases of Array.from(leasesByUnit.values())) {
          // Filter out declined and cancelled leases
          const validLeases = unitLeases.filter((l) => {
            if (l.status === "declined" || l.status === "cancelled") return false;
            return true;
          });

          if (validLeases.length === 0) continue;

          // Process each lease on this unit
          const unitProcessedLeases = validLeases.map((l) => {
            const unredeemedCode = l.inviteCodes?.find((c) => !c.redeemedAt);
            const isPendingInApp = l.status === "pending";

            let leaseStatus: "active" | "ended" | "moved_out" | "upcoming" | "pending" | "invite_sent" | "invite_expired" = "active";

            if (unredeemedCode) {
              const isExpired = new Date(unredeemedCode.expiresAt) <= today;
              leaseStatus = isExpired ? "invite_expired" : "invite_sent";
            } else if (isPendingInApp) {
              const isExpired = Boolean(l.invitationExpiresAt && new Date(l.invitationExpiresAt) <= today);
              leaseStatus = isExpired ? "invite_expired" : "invite_sent";
            } else if (l.terminatedAt) {
              leaseStatus = "moved_out";
            } else {
              const startStr = formatLagosYMD(l.startDate);
              const endStr = formatLagosYMD(l.endDate);
              if (todayStr < startStr) {
                leaseStatus = "upcoming";
              } else if (todayStr >= endStr) {
                leaseStatus = "ended";
              } else {
                leaseStatus = "active";
              }
            }

            const balance = getLeaseBalance(
              {
                startDate: l.startDate,
                endDate: l.endDate,
                rentAmount: l.rentAmount,
                rentFrequency: l.rentFrequency,
              },
              l.payments,
              today
            );

            const dueStatus = getDueDateStatus(
              balance.nextDueDate,
              l.endDate,
              today,
              balance.unpaidPeriods
            );

            return {
              id: l.id,
              unitId: l.unit.id,
              unitName: l.unit.unitNumber,
              propertyId: l.unit.property.id,
              propertyName: l.unit.property.name,
              startDate: l.startDate.toISOString(),
              endDate: l.endDate.toISOString(),
              rentAmount: Number(l.rentAmount),
              rentFrequency: l.rentFrequency,
              leaseStatus,
              nextDueDate: balance.nextDueDate ? balance.nextDueDate.toISOString() : null,
              unpaidPeriods: balance.unpaidPeriods,
              nextDueStatus: (leaseStatus === "invite_sent" || leaseStatus === "invite_expired") ? ("pending" as const) : dueStatus.status,
              nextDueText: (leaseStatus === "invite_sent" || leaseStatus === "invite_expired") ? "—" : dueStatus.text,
              totalLeaseRent: balance.totalLeaseRent,
              totalPaid: balance.paidToDate,
              outstanding: balance.outstanding,
              inviteCode: unredeemedCode?.code ?? null,
              inviteExpiresAt: unredeemedCode
                ? unredeemedCode.expiresAt.toISOString()
                : l.invitationExpiresAt
                ? l.invitationExpiresAt.toISOString()
                : null,
              isCodeInvite: Boolean(unredeemedCode),
              hasPayments: l.payments.length > 0,
            };
          });

          // Sort newest first
          unitProcessedLeases.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
          allProcessedLeases.push(...unitProcessedLeases);

          // Current lease for this unit: the one returned by getCurrentLease, or newest
          const current = getCurrentLease(validLeases, today) || validLeases[0];
          const currentProcessed = unitProcessedLeases.find((p) => p.id === current.id) || unitProcessedLeases[0];
          processedUnits.push({
            unitId: current.unit.id,
            unitName: current.unit.unitNumber,
            propertyId: current.unit.property.id,
            propertyName: current.unit.property.name,
            currentLease: currentProcessed,
            allLeases: unitProcessedLeases,
          });
        }

        const isCurrent = allProcessedLeases.some(
          (l) =>
            l.leaseStatus === "active" ||
            l.leaseStatus === "upcoming" ||
            l.leaseStatus === "invite_sent" ||
            l.leaseStatus === "invite_expired"
        );

        let overallStatus:
          | "ended"
          | "moved_out"
          | "active"
          | "upcoming"
          | "invite_sent"
          | "invite_expired" = "ended";
        if (allProcessedLeases.some((l) => l.leaseStatus === "active")) {
          overallStatus = "active";
        } else if (allProcessedLeases.some((l) => l.leaseStatus === "upcoming")) {
          overallStatus = "upcoming";
        } else if (allProcessedLeases.some((l) => l.leaseStatus === "invite_expired")) {
          overallStatus = "invite_expired";
        } else if (allProcessedLeases.some((l) => l.leaseStatus === "invite_sent")) {
          overallStatus = "invite_sent";
        } else if (allProcessedLeases.some((l) => l.leaseStatus === "ended")) {
          overallStatus = "ended";
        } else if (allProcessedLeases.some((l) => l.leaseStatus === "moved_out")) {
          overallStatus = "moved_out";
        }

        const primaryUnit = processedUnits[0]?.unitName ?? "—";
        const moreCount = Math.max(0, processedUnits.length - 1);

        const uniqueProperties = Array.from(new Set(allProcessedLeases.map((l) => l.propertyName)));
        const propertyDisplay =
          uniqueProperties.length === 1
            ? uniqueProperties[0]
            : uniqueProperties.length > 1
            ? `${uniqueProperties.length} properties`
            : "—";

        const activeLeases = allProcessedLeases.filter(
          (l) => l.leaseStatus === "active" || l.leaseStatus === "upcoming"
        );

        let nextRentDue: {
          type: "overdue" | "today" | "upcoming" | "paid_in_full" | "expired";
          dueDate: string | null;
          unpaidPeriods: number;
          leaseStartDate: string | null;
          isUpcomingLease: boolean;
        };

        if (activeLeases.length === 0) {
          nextRentDue = {
            type: "expired",
            dueDate: null,
            unpaidPeriods: 0,
            leaseStartDate: null,
            isUpcomingLease: false,
          };
        } else {
          const leasesWithDue = activeLeases.filter((l) => l.nextDueDate !== null);
          if (leasesWithDue.length === 0) {
            nextRentDue = {
              type: "paid_in_full",
              dueDate: null,
              unpaidPeriods: 0,
              leaseStartDate: null,
              isUpcomingLease: false,
            };
          } else {
            leasesWithDue.sort(
              (a, b) => new Date(a.nextDueDate!).getTime() - new Date(b.nextDueDate!).getTime()
            );
            const earliest = leasesWithDue[0];
            nextRentDue = {
              type: earliest.nextDueStatus as "overdue" | "today" | "upcoming",
              dueDate: earliest.nextDueDate,
              unpaidPeriods: earliest.unpaidPeriods,
              leaseStartDate: earliest.startDate,
              isUpcomingLease: earliest.leaseStatus === "upcoming",
            };
          }
        }

        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
          leases: allProcessedLeases,
          units: processedUnits,
          unitDisplay: {
            primaryUnit,
            moreCount,
          },
          propertyDisplay,
          overallStatus,
          isCurrent,
          nextRentDue,
        };
      });

      const filteredTenants = computedTenants.filter((tenant) => {
        if (input?.status === "active" && !tenant.isCurrent) return false;
        if (input?.status === "past" && tenant.isCurrent) return false;

        if (input?.leaseStatus) {
          const matchesOverall = tenant.overallStatus === input.leaseStatus;
          const matchesAnyLease = tenant.leases.some((l) => l.leaseStatus === input.leaseStatus);
          if (!matchesOverall && !matchesAnyLease) return false;
        }

        return true;
      });

      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 25;
      const total = filteredTenants.length;
      const rows = filteredTenants.slice((page - 1) * pageSize, page * pageSize);

      return {
        rows,
        total,
      };
    }),
});

