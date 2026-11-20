import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DOCS_PER_LEASE = 20;

function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot !== -1 ? name.slice(lastDot).toLowerCase() : "";
  const base = lastDot !== -1 ? name.slice(0, lastDot) : name;
  const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "");
  return `${safeBase || "document"}${safeExt}`;
}

function isValidFileType(type: string, name: string): boolean {
  const normType = type.toLowerCase().trim();
  if (ALLOWED_MIME_TYPES.has(normType)) return true;

  const lastDot = name.lastIndexOf(".");
  if (lastDot !== -1) {
    const ext = name.slice(lastDot).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) return true;
  }

  return false;
}

export const documentsRouter = router({
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

      const isLandlord = lease.unit.property.landlordId === ctx.user.id;
      const isTenant = lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to documents for this lease.",
        });
      }

      return await prisma.leaseDocument.findMany({
        where: { leaseId: input.leaseId },
        orderBy: { createdAt: "desc" },
      });
    }),

  createUploadUrl: authedProcedure
    .input(
      z.object({
        leaseId: z.string().uuid(),
        name: z.string().min(1),
        size: z.number().int().positive(),
        type: z.string(),
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

      if (lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the landlord can upload lease documents.",
        });
      }

      if (!isValidFileType(input.type, input.name)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid file type. Only PDF, JPG, and PNG files are allowed.",
        });
      }

      if (input.size > MAX_FILE_SIZE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File is larger than 10MB.",
        });
      }

      const count = await prisma.leaseDocument.count({
        where: { leaseId: input.leaseId },
      });
      if (count >= MAX_DOCS_PER_LEASE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum of 20 documents allowed per lease.",
        });
      }

      const safeName = sanitizeFileName(input.name);
      const fileId = crypto.randomUUID();
      const path = `${input.leaseId}/docs/${fileId}-${safeName}`;

      const { data, error } = await ctx.supabase.storage
        .from("leases")
        .createSignedUploadUrl(path);

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create upload URL: ${error?.message || "Unknown error"}`,
        });
      }

      return {
        signedUrl: data.signedUrl,
        token: data.token,
        path,
      };
    }),

  confirm: authedProcedure
    .input(
      z.object({
        leaseId: z.string().uuid(),
        name: z.string().min(1),
        path: z.string().min(1),
        size: z.number().int().nonnegative(),
        type: z.string(),
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

      if (lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the landlord can confirm lease documents.",
        });
      }

      if (!isValidFileType(input.type, input.name)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid file type. Only PDF, JPG, and PNG files are allowed.",
        });
      }

      if (input.size > MAX_FILE_SIZE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File is larger than 10MB.",
        });
      }

      const count = await prisma.leaseDocument.count({
        where: { leaseId: input.leaseId },
      });
      if (count >= MAX_DOCS_PER_LEASE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum of 20 documents allowed per lease.",
        });
      }

      return await prisma.leaseDocument.create({
        data: {
          leaseId: input.leaseId,
          name: input.name,
          path: input.path,
          sizeBytes: input.size,
          mimeType: input.type,
          uploadedById: ctx.user.id,
        },
      });
    }),

  getViewUrl: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const doc = await prisma.leaseDocument.findUnique({
        where: { id: input.id },
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

      if (!doc) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Document not found.",
        });
      }

      const isLandlord = doc.lease.unit.property.landlordId === ctx.user.id;
      const isTenant = doc.lease.tenantId === ctx.user.id;

      if (!isLandlord && !isTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied.",
        });
      }

      const { data, error } = await ctx.supabase.storage
        .from("leases")
        .createSignedUrl(doc.path, 60);

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create download URL: ${error?.message || "Unknown error"}`,
        });
      }

      return {
        signedUrl: data.signedUrl,
      };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await prisma.leaseDocument.findUnique({
        where: { id: input.id },
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

      if (!doc) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Document not found.",
        });
      }

      if (doc.lease.unit.property.landlordId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the landlord can delete lease documents.",
        });
      }

      // Remove from storage
      await ctx.supabase.storage.from("leases").remove([doc.path]);

      // Remove from database
      await prisma.leaseDocument.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
