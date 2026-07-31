import { initTRPC, TRPCError } from "@trpc/server";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/lib/prisma";
import { type Role } from "@prisma/client";

export interface Context {
  user: {
    id: string;
    email: string;
    role: Role;
    fullName: string;
    avatarUrl: string | null;
  } | null;
  supabase: ReturnType<typeof buildSupabaseFromRequest>;
  req?: Request;
}

/**
 * Build a Supabase client that reads cookies directly from the incoming Request.
 * Using next/headers cookies() for mutations (POST) in App Router Route Handlers
 * can silently return an empty store, causing auth to fail. Reading from req.headers
 * works reliably for both GET (queries) and POST (mutations).
 */
function buildSupabaseFromRequest(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieMap: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) cookieMap[key] = val;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieMap[name];
        },
        // Cookie mutation not needed here; middleware handles session refresh.
        set() {},
        remove() {},
      },
    }
  );
}

/**
 * Build the tRPC context for each request.
 *
 * Performance notes:
 * - We use getSession() instead of getUser() to avoid an outbound HTTP request to the
 *   Supabase Auth API on every tRPC call. getSession() validates the JWT locally from
 *   the cookie — no network round-trip. The subsequent prisma.user.findUnique() by PK
 *   is the definitive identity check.
 * - The session is always fresh because Next.js middleware calls updateSession() on
 *   every navigation request before this context runs.
 * - provisionStorage() has been removed from this hot path. Storage buckets (leases,
 *   avatars) should be created once via the Supabase Dashboard.
 */
export async function createContext(req: Request): Promise<Context> {
  const supabase = buildSupabaseFromRequest(req);
  try {
    // getSession() reads the JWT from the cookie and validates the signature locally —
    // no network call. This is the primary latency win vs getUser().
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const authUser = session?.user ?? null;

    if (!authUser) {
      return { user: null, supabase, req };
    }

    // Verify the user exists in our database (primary key lookup — fast with PK index).
    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
    });

    if (!dbUser) {
      return { user: null, supabase, req };
    }

    return {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        fullName: dbUser.fullName,
        avatarUrl: dbUser.avatarUrl,
      },
      supabase,
      req,
    };
  } catch (error) {
    console.error("[createContext] Unexpected error:", error);
    return { user: null, supabase, req };
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
      supabase: ctx.supabase,
      req: ctx.req,
    },
  });
});

/**
 * Procedure for cron and background tasks.
 * Validates request authorization header against CRON_SECRET for security.
 */
export const internalProcedure = t.procedure.use(async ({ ctx, next }) => {
  const req = ctx.req;
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      // In development mode, we bypass authentication to allow quick browser testing if no auth header was sent.
      if (process.env.NODE_ENV === "development" && !authHeader) {
        console.warn("[internalProcedure] Bypassing CRON_SECRET check in development mode.");
      } else {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unauthorized internal procedure invocation.",
        });
      }
    }
  }

  return next({
    ctx: {
      user: ctx.user,
      supabase: ctx.supabase,
      req: ctx.req,
    },
  });
});
