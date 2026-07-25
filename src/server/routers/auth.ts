import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";

export const authRouter = router({
  signupLandlord: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6),
        fullName: z.string().min(2),
        phone: z.string().optional(),
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
          message: error.message,
        });
      }

      if (!data.user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "User creation failed.",
        });
      }

      // 2. Create profile in public database
      try {
        const user = await prisma.user.create({
          data: {
            id: data.user.id,
            email: input.email,
            phone: input.phone || null,
            role: "landlord",
            fullName: input.fullName,
          },
        });
        return { user };
      } catch (dbError) {
        // Rollback Supabase user if public profile insertion fails
        await supabase.auth.admin.deleteUser(data.user.id);
        const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create public user profile: " + errorMessage,
        });
      }
    }),

  signupTenant: publicProcedure
    .input(
      z.object({
        inviteCode: z.string().min(3),
        email: z.string().email(),
        password: z.string().min(6),
        fullName: z.string().min(2),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // 1. Fetch and validate the invite code
      const invite = await prisma.inviteCode.findFirst({
        where: { code: input.inviteCode },
        include: {
          lease: {
            include: {
              tenant: true,
            },
          },
        },
      });

      if (!invite) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid invite code.",
        });
      }

      if (invite.redeemedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite code has already been redeemed.",
        });
      }

      if (new Date() > invite.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite code has expired.",
        });
      }

      // Check if email matches the placeholder tenant's email
      if (invite.lease.tenant.email.toLowerCase() !== input.email.toLowerCase()) {
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
          message: error.message,
        });
      }

      if (!data.user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "User creation failed.",
        });
      }

      // 3. Update public user profile and redeem the code
      try {
        await prisma.$transaction([
          // Update database profile id to match new Supabase auth user id
          // CASCADE ON UPDATE on all related tables ensures all tenantId references are updated!
          prisma.user.update({
            where: { id: invite.lease.tenantId },
            data: {
              id: data.user.id,
              fullName: input.fullName,
              phone: input.phone || null,
            },
          }),
          // Mark invite code as redeemed
          prisma.inviteCode.update({
            where: { id: invite.id },
            data: {
              redeemedAt: new Date(),
            },
          }),
        ]);

        return { success: true };
      } catch (dbError) {
        const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to link tenant account: " + errorMessage,
        });
      }
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
});
