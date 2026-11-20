import { formatLagosYMD } from "./billing";

export interface LeaseLike {
  id?: string;
  startDate: Date | string;
  endDate: Date | string;
  terminatedAt?: Date | string | null;
  status?: string | null;
  invitationExpiresAt?: Date | string | null;
  inviteCodes?: Array<{
    code?: string;
    redeemedAt?: Date | string | null;
    expiresAt?: Date | string | null;
  }> | null;
  [key: string]: unknown;
}

/**
 * Checks if a lease is active (not terminated and status is active or unassigned for backwards-compat).
 */
function isLeaseActive(l: LeaseLike): boolean {
  if (l.terminatedAt) return false;
  if (!l.status || l.status === "active") return true;
  return false;
}

/**
 * Among non-terminated, active leases, returns:
 * 1. The one where startDate <= today <= endDate (Africa/Lagos date).
 * 2. If none is running today, the earliest upcoming one (startDate > today, sorted ascending).
 * 3. If none, the most recent past one (endDate < today, sorted descending).
 */
export function getCurrentLease<T extends LeaseLike>(
  leases: T[] | null | undefined,
  today: Date | string = new Date()
): T | null {
  if (!leases || leases.length === 0) return null;

  const todayStr = formatLagosYMD(today);
  const activeLeases = leases.filter(isLeaseActive);
  if (activeLeases.length === 0) return null;

  // 1. Running today: startDate <= todayStr <= endDate
  const running = activeLeases.filter((l) => {
    const startStr = formatLagosYMD(l.startDate);
    const endStr = formatLagosYMD(l.endDate);
    return startStr <= todayStr && todayStr <= endStr;
  });

  if (running.length > 0) {
    running.sort((a, b) => formatLagosYMD(a.startDate).localeCompare(formatLagosYMD(b.startDate)));
    return running[0];
  }

  // 2. Earliest upcoming: startDate > todayStr
  const upcoming = activeLeases.filter((l) => formatLagosYMD(l.startDate) > todayStr);
  if (upcoming.length > 0) {
    upcoming.sort((a, b) => formatLagosYMD(a.startDate).localeCompare(formatLagosYMD(b.startDate)));
    return upcoming[0];
  }

  // 3. Most recent past: endDate < todayStr
  const past = activeLeases.filter((l) => formatLagosYMD(l.endDate) < todayStr);
  if (past.length > 0) {
    past.sort((a, b) => formatLagosYMD(b.endDate).localeCompare(formatLagosYMD(a.endDate)));
    return past[0];
  }

  return null;
}

/**
 * Returns the earliest non-terminated, active lease that starts after the base lease ends.
 * Can be called with:
 * - getNextLease(leases, today) -> derives base lease as getCurrentLease(leases, today)
 * - getNextLease(leases, today, referenceLease) -> uses referenceLease as the base lease being viewed
 * - getNextLease(leases, referenceLease) -> uses referenceLease as the base lease being viewed
 */
export function getNextLease<T extends LeaseLike>(
  leases: T[] | null | undefined,
  todayOrCurrentLease: Date | string | T = new Date(),
  referenceLeaseOrToday?: T | Date | string | null
): T | null {
  if (!leases || leases.length === 0) return null;

  let baseLease: T | null = null;
  let today: Date | string = new Date();

  // Check if 2nd arg is a LeaseLike object
  if (
    todayOrCurrentLease &&
    typeof todayOrCurrentLease === "object" &&
    !(todayOrCurrentLease instanceof Date) &&
    "startDate" in todayOrCurrentLease &&
    "endDate" in todayOrCurrentLease
  ) {
    baseLease = todayOrCurrentLease as T;
    if (referenceLeaseOrToday instanceof Date || typeof referenceLeaseOrToday === "string") {
      today = referenceLeaseOrToday;
    }
  } else {
    today = (todayOrCurrentLease as Date | string) || new Date();
    if (
      referenceLeaseOrToday &&
      typeof referenceLeaseOrToday === "object" &&
      !(referenceLeaseOrToday instanceof Date) &&
      "startDate" in referenceLeaseOrToday &&
      "endDate" in referenceLeaseOrToday
    ) {
      baseLease = referenceLeaseOrToday as T;
    } else {
      baseLease = getCurrentLease(leases, today);
    }
  }

  if (!baseLease) return null;

  const baseEndStr = formatLagosYMD(baseLease.endDate);
  const activeLeases = leases.filter(isLeaseActive);

  // Subsequent leases that start after the base lease ends, excluding the base lease itself
  const subsequent = activeLeases.filter((l) => {
    if (l === baseLease) return false;
    if (l.id && baseLease?.id && l.id === baseLease.id) return false;
    const startStr = formatLagosYMD(l.startDate);
    return startStr > baseEndStr;
  });

  if (subsequent.length === 0) return null;

  subsequent.sort((a, b) => formatLagosYMD(a.startDate).localeCompare(formatLagosYMD(b.startDate)));
  return subsequent[0];
}

function hasUnredeemedInvite(l: LeaseLike): boolean {
  if (l.terminatedAt) return false;
  if (l.status === "declined" || l.status === "cancelled") return false;
  if (l.status === "pending") return true;
  if (l.inviteCodes && l.inviteCodes.length > 0) {
    return l.inviteCodes.some((c) => !c.redeemedAt);
  }
  return false;
}

/**
 * Derives unit occupancy status:
 * - "occupied": current active lease is running today and not awaiting invite redemption
 * - "reserved": no lease running today, but an upcoming active lease exists OR an unredeemed invite (code or pending) exists
 * - "vacant": no running or upcoming active lease and no unredeemed invite
 */
export function getUnitStatus(
  leases: LeaseLike[] | null | undefined,
  today: Date | string = new Date()
): "occupied" | "reserved" | "vacant" {
  const current = getCurrentLease(leases, today);
  const todayStr = formatLagosYMD(today);

  if (current) {
    if (hasUnredeemedInvite(current)) {
      return "reserved";
    }

    const startStr = formatLagosYMD(current.startDate);
    const endStr = formatLagosYMD(current.endDate);

    if (startStr <= todayStr && todayStr <= endStr) {
      return "occupied";
    }

    if (startStr > todayStr) {
      return "reserved";
    }
  }

  // Check if there is an unredeemed code invite or an unexpired pending invitation for this unit
  if (leases && leases.length > 0) {
    const hasUnexpiredPendingOrCode = leases.some((l) => {
      if (l.terminatedAt) return false;
      if (l.inviteCodes && l.inviteCodes.length > 0) {
        return l.inviteCodes.some((c) => !c.redeemedAt);
      }
      if (l.status !== "pending") return false;
      if (!l.invitationExpiresAt) return true;
      return new Date(l.invitationExpiresAt) >= new Date(today);
    });
    if (hasUnexpiredPendingOrCode) {
      return "reserved";
    }
  }

  return "vacant";
}
