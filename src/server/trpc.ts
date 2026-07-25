import { initTRPC, TRPCError } from "@trpc/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { type Role } from "@prisma/client";

export interface Context {
  user: {
    id: string;
    email: string;
    role: Role;
    fullName: string;
  } | null;
}

let isStorageProvisioned = false;

async function provisionStorage() {
  if (isStorageProvisioned) return;
  try {
    // Inserts the storage bucket row in Supabase's storage schema directly
    await prisma.$executeRawUnsafe(`
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('leases', 'leases', false)
      ON CONFLICT (id) DO NOTHING;
    `);
    isStorageProvisioned = true;
  } catch (error) {
    console.error("Storage provisioning failed:", error);
  }
}

export async function createContext(): Promise<Context> {
  try {
    await provisionStorage();

    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { user: null };
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
    });

    if (!dbUser) {
      return { user: null };
    }

    return {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        fullName: dbUser.fullName,
      },
    };
  } catch {
    return { user: null };
  }
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});
