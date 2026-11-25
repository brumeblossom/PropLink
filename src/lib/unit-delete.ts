export type UnitDeleteCheckResult =
  | { ok: true }
  | { ok: false; reason: "occupied" | "reserved"; tenantName: string };

export interface UnitDeleteLease {
  id?: string;
  startDate: Date | string;
  endDate?: Date | string | null;
  status?: string | null;
  terminatedAt?: Date | string | null;
  invitationExpiresAt?: Date | string | null;
  tenant?: {
    fullName?: string | null;
  } | null;
  inviteCodes?: Array<{
    code?: string;
    redeemedAt?: Date | string | null;
    expiresAt: Date | string;
  }> | null;
}

/**
 * Checks whether a unit can be safely deleted.
 *
 * Rules:
 * - occupied: a lease with terminatedAt null, status not declined/cancelled,
 *   startDate <= now and (endDate is null OR endDate >= now).
 * - reserved: a lease that hasn't ended (endDate null or >= now),
 *   not terminated/declined/cancelled, with an unredeemed invite code or a pending in-app invitation.
 * - Ended or moved-out leases, and expired invites for ended leases, do NOT block.
 */
export function canDeleteUnit(
  leases: UnitDeleteLease[],
  now: Date = new Date()
): UnitDeleteCheckResult {
  // First check for occupied leases (priority over reserved)
  for (const lease of leases) {
    if (lease.terminatedAt !== null && lease.terminatedAt !== undefined) {
      continue;
    }
    const status = lease.status?.toLowerCase();
    if (status === "declined" || status === "cancelled") {
      continue;
    }

    const start = new Date(lease.startDate);
    const end = lease.endDate ? new Date(lease.endDate) : null;

    const isActive = start <= now && (end === null || end >= now);
    if (isActive) {
      const hasUnredeemedCode = Boolean(
        lease.inviteCodes?.some((c) => !c.redeemedAt && new Date(c.expiresAt) > now)
      );
      const isPendingInApp =
        status === "pending" &&
        (!lease.invitationExpiresAt || new Date(lease.invitationExpiresAt) > now);

      if (!hasUnredeemedCode && !isPendingInApp) {
        return {
          ok: false,
          reason: "occupied",
          tenantName: lease.tenant?.fullName?.trim() || "Tenant",
        };
      }
    }
  }

  // Next check for reserved leases (pending in-app or unredeemed active code on an unended lease)
  for (const lease of leases) {
    if (lease.terminatedAt !== null && lease.terminatedAt !== undefined) {
      continue;
    }
    const status = lease.status?.toLowerCase();
    if (status === "declined" || status === "cancelled") {
      continue;
    }

    const end = lease.endDate ? new Date(lease.endDate) : null;
    const isNotEnded = end === null || end >= now;

    if (!isNotEnded) {
      continue;
    }

    const hasUnredeemedCode = Boolean(
      lease.inviteCodes?.some((c) => !c.redeemedAt && new Date(c.expiresAt) > now)
    );
    const isPendingInApp =
      status === "pending" &&
      (!lease.invitationExpiresAt || new Date(lease.invitationExpiresAt) > now);

    if (hasUnredeemedCode || isPendingInApp) {
      return {
        ok: false,
        reason: "reserved",
        tenantName: lease.tenant?.fullName?.trim() || "Tenant",
      };
    }
  }

  return { ok: true };
}

export function getUnitDeleteErrorMessage(
  unitNumber: string,
  result: UnitDeleteCheckResult
): string {
  if (result.ok) return "";
  if (result.reason === "occupied") {
    return `${result.tenantName} is still living in ${unitNumber}. Mark them as moved out first.`;
  }
  return `${unitNumber} has a pending invite for ${result.tenantName}. Cancel the invite first.`;
}

