import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { RentFrequency, Role } from "@prisma/client";
import { createNotification } from "../utils/notifications";
import { getLeaseBalance, getDueDateStatus, formatLagosYMD } from "@/lib/billing";

export const leasesRouter = router({
  create: authedProcedure
    .input(
      z.object({
        unitId: z.string().uuid(),
        tenantEmail: z.string().trim().email("A valid email address is required"),
        tenantName: z.string().trim().min(1, "Tenant full name is required"),
        startDate: z.string().optional().nullable(),
        endDate: z.string().optional().nullable(),
        rentAmount: z.number().nonnegative().optional().nullable(),
        rentFrequency: z.nativeEnum(RentFrequency).optional().default(RentFrequency.annually),
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

      // Check for overlapping active leases for this unit
      const overlap = await prisma.lease.findFirst({
        where: {
          unitId: input.unitId,
          terminatedAt: null,
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

      // Find or create placeholder tenant user profile
      let tenant = await prisma.user.findUnique({
        where: { email: input.tenantEmail },
      });
      let isNewTenant = false;

      if (!tenant) {
        tenant = await prisma.user.create({
          data: {
            email: input.tenantEmail,
            fullName: input.tenantName,
            role: "tenant",
          },
        });
        isNewTenant = true;
      }

      // Create the lease record
      const lease = await prisma.lease.create({
        data: {
          unitId: input.unitId,
          tenantId: tenant.id,
          startDate: start,
          endDate: end,
          rentAmount: input.rentAmount ?? 0,
          rentFrequency: input.rentFrequency ?? RentFrequency.annually,
          depositAmount: input.depositAmount ?? null,
          renewalWindowDays: input.renewalWindowDays,
        },
      });

      // Generate a one-time invite code if this is a newly created placeholder tenant
      let inviteCode = null;
      if (isNewTenant) {
        const code = "PL-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // valid for 7 days

        inviteCode = await prisma.inviteCode.create({
          data: {
            leaseId: lease.id,
            code,
            expiresAt,
          },
        });
      }

      if (!isNewTenant) {
        try {
          await createNotification({
            recipientId: tenant.id,
            type: "lease_created",
            title: "New Lease Agreement",
            body: `A new lease agreement has been created for you at unit ${unit.unitNumber}.`,
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

      return await prisma.lease.findMany({
        where: { unitId: input.unitId },
        include: {
          tenant: {
            select: { fullName: true, email: true, phone: true, avatarUrl: true },
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

      let status: "terminated" | "upcoming" | "active" | "renewal_due" | "expired" = "active";

      if (lease.terminatedAt) {
        status = "terminated";
      } else if (today < start) {
        status = "upcoming";
      } else if (today > end) {
        status = "expired";
      } else {
        const renewalStartDate = new Date(end);
        renewalStartDate.setDate(renewalStartDate.getDate() - lease.renewalWindowDays);
        if (today >= renewalStartDate) {
          status = "renewal_due";
        } else {
          status = "active";
        }
      }

      const renewalStartDate = new Date(end);
      renewalStartDate.setDate(renewalStartDate.getDate() - lease.renewalWindowDays);

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
        renewalStartDate,
        terminatedAt: lease.terminatedAt,
        status,
        today,
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

  getMine: authedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "tenant") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only tenants can view their leases.",
        });
      }

      return await prisma.lease.findMany({
        where: { tenantId: ctx.user.id },
        include: {
          unit: {
            include: {
              property: {
                include: {
                  landlord: {
                    select: {
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

  renew: authedProcedure
    .input(
      z.object({
        sourceLeaseId: z.string().uuid(),
        startDate: z.string(),
        endDate: z.string(),
        rentAmount: z.number().nonnegative(),
        rentFrequency: z.nativeEnum(RentFrequency).default(RentFrequency.annually),
        depositAmount: z.number().positive().optional().nullable(),
        renewalWindowDays: z.number().int().positive().default(60),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch the source lease
      const sourceLease = await prisma.lease.findUnique({
        where: { id: input.sourceLeaseId },
        include: {
          unit: { include: { property: true } },
          tenant: { select: { fullName: true, email: true } },
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

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      if (start >= end) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Renewal start date must be before end date.",
        });
      }

      // 3. Overlap check — same logic as leases.create
      const overlap = await prisma.lease.findFirst({
        where: {
          unitId: sourceLease.unitId,
          terminatedAt: null,
          NOT: {
            OR: [{ endDate: { lt: start } }, { startDate: { gt: end } }],
          },
        },
        include: {
          tenant: { select: { fullName: true } },
        },
      });

      if (overlap) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This unit already has an active lease for ${
            overlap.tenant.fullName
          } until ${new Date(overlap.endDate).toLocaleDateString()}. The renewal start date must be after the existing lease ends.`,
        });
      }

      // 4. Create the new lease — tenant linked directly, no invite code
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
        },
      });

      return { lease: newLease };
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
        leaseStatus: z.enum(["active", "renewal_due", "expired"]).optional(),
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
        const processedLeases = user.leasesAsTenant.map((lease) => {
          let leaseStatus: "active" | "renewal_due" | "expired" | "upcoming" | "terminated" = "active";
          if (lease.terminatedAt) {
            leaseStatus = "terminated";
          } else {
            const startStr = formatLagosYMD(lease.startDate);
            const endStr = formatLagosYMD(lease.endDate);
            if (todayStr < startStr) {
              leaseStatus = "upcoming";
            } else if (todayStr > endStr) {
              leaseStatus = "expired";
            } else {
              const renewalDate = new Date(lease.endDate);
              renewalDate.setDate(renewalDate.getDate() - (lease.renewalWindowDays ?? 60));
              const renewalStr = formatLagosYMD(renewalDate);
              if (todayStr >= renewalStr) {
                leaseStatus = "renewal_due";
              } else {
                leaseStatus = "active";
              }
            }
          }

          const balance = getLeaseBalance(
            {
              startDate: lease.startDate,
              endDate: lease.endDate,
              rentAmount: lease.rentAmount,
              rentFrequency: lease.rentFrequency,
            },
            lease.payments,
            today
          );

          const dueStatus = getDueDateStatus(
            balance.nextDueDate,
            lease.endDate,
            today,
            balance.unpaidPeriods
          );

          return {
            id: lease.id,
            unitId: lease.unit.id,
            unitName: lease.unit.unitNumber,
            propertyId: lease.unit.property.id,
            propertyName: lease.unit.property.name,
            startDate: lease.startDate.toISOString(),
            endDate: lease.endDate.toISOString(),
            rentAmount: Number(lease.rentAmount),
            rentFrequency: lease.rentFrequency,
            leaseStatus,
            nextDueDate: balance.nextDueDate ? balance.nextDueDate.toISOString() : null,
            nextDueStatus: dueStatus.status,
            nextDueText: dueStatus.text,
          };
        });

        const isCurrent = processedLeases.some(
          (l) => l.leaseStatus === "active" || l.leaseStatus === "renewal_due" || l.leaseStatus === "upcoming"
        );

        let overallStatus: "expired" | "renewal_due" | "active" | "upcoming" | "terminated" = "active";
        if (processedLeases.some((l) => l.leaseStatus === "expired")) {
          overallStatus = "expired";
        } else if (processedLeases.some((l) => l.leaseStatus === "renewal_due")) {
          overallStatus = "renewal_due";
        } else if (processedLeases.some((l) => l.leaseStatus === "active")) {
          overallStatus = "active";
        } else if (processedLeases.some((l) => l.leaseStatus === "upcoming")) {
          overallStatus = "upcoming";
        } else if (processedLeases.some((l) => l.leaseStatus === "terminated")) {
          overallStatus = "terminated";
        }

        const primaryUnit = processedLeases[0]?.unitName ?? "—";
        const moreCount = Math.max(0, processedLeases.length - 1);

        const uniqueProperties = Array.from(new Set(processedLeases.map((l) => l.propertyName)));
        const propertyDisplay =
          uniqueProperties.length === 1
            ? uniqueProperties[0]
            : uniqueProperties.length > 1
            ? `${uniqueProperties.length} properties`
            : "—";

        const activeLeases = processedLeases.filter(
          (l) => l.leaseStatus === "active" || l.leaseStatus === "renewal_due" || l.leaseStatus === "upcoming"
        );

        let nextRentDue: {
          text: string;
          status: "overdue" | "today" | "upcoming" | "paid_in_full" | "past";
          date: string | null;
        };

        if (activeLeases.length === 0) {
          nextRentDue = {
            text: "—",
            status: "past",
            date: null,
          };
        } else {
          const leasesWithDue = activeLeases.filter((l) => l.nextDueDate !== null);
          if (leasesWithDue.length === 0) {
            nextRentDue = {
              text: "Paid to end of lease",
              status: "paid_in_full",
              date: null,
            };
          } else {
            leasesWithDue.sort(
              (a, b) => new Date(a.nextDueDate!).getTime() - new Date(b.nextDueDate!).getTime()
            );
            const earliest = leasesWithDue[0];
            nextRentDue = {
              text: earliest.nextDueText,
              status: earliest.nextDueStatus as "overdue" | "today" | "upcoming",
              date: earliest.nextDueDate,
            };
          }
        }

        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
          leases: processedLeases,
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

