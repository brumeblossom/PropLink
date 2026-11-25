import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";

export const INVITE_ATTEMPT_LIMIT = 10;
export const INVITE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const INVITE_RETENTION_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Pure function that decides allow/deny from an attempt count.
 * Returns true if the attempt count has reached or exceeded the limit.
 */
export function isRateLimited(attemptCount: number, limit: number = INVITE_ATTEMPT_LIMIT): boolean {
  return attemptCount >= limit;
}

/**
 * Extracts the first IP from x-forwarded-for or fallback header and hashes it
 * with INVITE_HASH_SALT or CRON_SECRET via SHA-256.
 */
export function getIpHashFromRequest(req?: Request | null): string {
  let clientIp = "unknown-ip";
  if (req) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      clientIp = forwarded.split(",")[0].trim();
    } else {
      clientIp = req.headers.get("x-real-ip")?.trim() || "unknown-ip";
    }
  }

  const salt = process.env.INVITE_HASH_SALT || process.env.CRON_SECRET || "proplink-default-salt";
  return crypto.createHash("sha256").update(`${clientIp}:${salt}`).digest("hex");
}

/**
 * Checks if the caller's IP hash has 10 or more failed attempts in the last 15 minutes.
 * If so, throws TRPCError TOO_MANY_REQUESTS.
 */
export async function assertInviteRateLimit(ipHash: string): Promise<void> {
  const windowStart = new Date(Date.now() - INVITE_WINDOW_MS);
  const failedAttempts = await prisma.inviteCodeAttempt.count({
    where: {
      ipHash,
      createdAt: {
        gte: windowStart,
      },
    },
  });

  if (isRateLimited(failedAttempts)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many attempts. Try again in 15 minutes.",
    });
  }
}

/**
 * Records a single failed lookup attempt for an IP hash.
 */
export async function recordFailedInviteAttempt(ipHash: string): Promise<void> {
  try {
    await prisma.inviteCodeAttempt.create({
      data: {
        ipHash,
      },
    });
  } catch (err) {
    console.error("[recordFailedInviteAttempt] Failed to log attempt:", err);
  }
}

/**
 * Deletes rows older than 1 day. Called in daily cron.
 */
export async function cleanupOldInviteAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - INVITE_RETENTION_MS);
  const result = await prisma.inviteCodeAttempt.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
    },
  });
  return result.count;
}
