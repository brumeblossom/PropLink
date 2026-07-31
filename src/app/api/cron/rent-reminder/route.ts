import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/trpc";

// Dynamic routing to ensure Next.js runs it on demand rather than caching static responses
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      // In development mode, we bypass authentication to allow quick browser testing if no auth header was sent.
      if (process.env.NODE_ENV === "development" && !authHeader) {
        console.warn("[Cron] Bypassing CRON_SECRET check in development mode.");
      } else {
        return new Response("Unauthorized", { status: 401 });
      }
    }
  }

  try {
    const ctx = await createContext(req);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.internal.runRentReminderCheck();
    return Response.json(result);
  } catch (error) {
    console.error("[Cron Handler Error]:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
