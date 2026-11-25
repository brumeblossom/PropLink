import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, authedProcedure } from "../trpc";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { getSanitizedAuthError } from "@/lib/auth-errors";
import { isPasswordValid } from "@/lib/password";
import { redeemInvite } from "../services/redeemInvite";
import {
  getIpHashFromRequest,
  assertInviteRateLimit,
  recordFailedInviteAttempt,
} from "../utils/inviteRateLimit";

export const authRouter = router({
  signupLandlord: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().refine((val) => isPasswordValid(val), {
          message: "Password doesn't meet the rules.",
        }),
        fullName: z.string().min(2),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = createClient();

      // 1. Create account in Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            full_name: input.fullName,
            role: "landlord",
          },
        },
      });

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: getSanitizedAuthError(error, error.message),
        });
      }

      if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An account with this email already exists. Log in instead.",
        });
      }

      // 2. Create profile in public database
      try {
        const user = await prisma.user.create({
          data: {
            id: data.user.id,
            email: input.email,
            role: "landlord",
            fullName: input.fullName,
          },
        });
        return { user };
      } catch (dbError) {
        // Rollback Supabase user if public profile insertion fails
        await supabase.auth.admin.deleteUser(data.user.id);
        
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: getSanitizedAuthError(
            dbError,
            "An unexpected error occurred while creating your profile. Please try again."
          ),
        });
      }
    }),

  signupTenant: publicProcedure
    .input(
      z.object({
        inviteCode: z.string().min(3),
        email: z.string().email(),
        password: z.string().refine((val) => isPasswordValid(val), {
          message: "Password doesn't meet the rules.",
        }),
        fullName: z.string().min(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ipHash = getIpHashFromRequest(ctx.req);
      await assertInviteRateLimit(ipHash);

      // 1. Fetch and validate the invite code
      const trimmedCode = input.inviteCode.trim();
      const invite = await prisma.inviteCode.findFirst({
        where: { code: trimmedCode },
        include: {
          lease: {
            include: {
              tenant: true,
            },
          },
        },
      });

      if (!invite) {
        await recordFailedInviteAttempt(ipHash);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite code has expired. Ask your landlord for a new one.",
        });
      }

      if (invite.redeemedAt) {
        await recordFailedInviteAttempt(ipHash);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite code has already been redeemed.",
        });
      }

      if (new Date() > invite.expiresAt) {
        await recordFailedInviteAttempt(ipHash);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite code has expired. Ask your landlord for a new one.",
        });
      }

      // Check if email matches the placeholder tenant's email
      if (invite.lease.tenant.email.toLowerCase() !== input.email.toLowerCase()) {
        await recordFailedInviteAttempt(ipHash);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The email address does not match the one registered with this invite code.",
        });
      }

      const supabase = createClient();

      // 2. Create account in Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            full_name: input.fullName,
            role: "tenant",
          },
        },
      });

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: getSanitizedAuthError(error, error.message),
        });
      }

      if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An account with this email already exists. Log in instead.",
        });
      }

      // 3. Update public user profile and redeem the code via shared service
      const result = await redeemInvite({
        code: trimmedCode,
        userId: data.user.id,
        email: input.email,
        fullName: input.fullName,
      });

      if (!result.success) {
        await supabase.auth.admin.deleteUser(data.user.id);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error,
        });
      }

      return { success: true };
    }),

  checkInviteCode: publicProcedure
    .input(
      z.object({
        inviteCode: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const ipHash = getIpHashFromRequest(ctx.req);
      await assertInviteRateLimit(ipHash);

      const trimmedCode = input.inviteCode.trim();
      const invite = await prisma.inviteCode.findFirst({
        where: { code: trimmedCode },
        include: {
          lease: {
            include: {
              tenant: true,
              unit: {
                include: {
                  property: true,
                },
              },
            },
          },
        },
      });

      if (!invite || invite.redeemedAt || new Date() > invite.expiresAt) {
        await recordFailedInviteAttempt(ipHash);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite code has expired. Ask your landlord for a new one.",
        });
      }

      return {
        valid: true,
        email: invite.lease.tenant.email,
        unitNumber: invite.lease.unit.unitNumber,
        propertyName: invite.lease.unit.property.name,
      };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (error) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: error.message,
        });
      }

      // Fetch public user role
      const dbUser = await prisma.user.findUnique({
        where: { id: data.user.id },
      });

      if (!dbUser) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "User profile not found in database.",
        });
      }

      return {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          role: dbUser.role,
        },
        session: data.session,
      };
    }),

  logout: publicProcedure.mutation(async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return { success: true };
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    return ctx.user;
  }),

  updateProfile: authedProcedure
    .input(
      z.object({
        fullName: z
          .string()
          .trim()
          .min(1, "Name is required")
          .max(40, "Name cannot exceed 40 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.update({
        where: { id: ctx.user.id },
        data: { fullName: input.fullName.trim() },
      });
      return { user };
    }),

  getAvatarUploadUrl: authedProcedure
    .input(
      z.object({
        fileName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fileExtension = input.fileName.split(".").pop() || "jpg";
      const filePath = `${ctx.user.id}/${Date.now()}.${fileExtension}`;

      const { data, error } = await ctx.supabase.storage
        .from("avatars")
        .createSignedUploadUrl(filePath);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create signed upload URL: ${error.message}`,
        });
      }

      const { data: publicUrlData } = ctx.supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      return {
        signedUrl: data.signedUrl,
        path: filePath,
        publicUrl: publicUrlData.publicUrl,
      };
    }),

  updateAvatarUrl: authedProcedure
    .input(
      z.object({
        avatarUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.update({
        where: { id: ctx.user.id },
        data: { avatarUrl: input.avatarUrl },
      });
      return { user };
    }),
});
