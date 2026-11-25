import { formatLagosYMD, getPeriodStarts, type PaymentLike } from "./billing";
import { formatCurrency } from "./utils";

export interface LeaseLike {
  id?: string;
  startDate: Date | string;
  endDate?: Date | string | null;
  terminatedAt?: Date | string | null;
  status?: string | null;
  rentAmount?: number | string | bigint | { toString(): string } | null;
  rentFrequency?: string | null;
  invitationExpiresAt?: Date | string | null;
  inviteCodes?: Array<{
    code?: string;
    redeemedAt?: Date | string | null;
    expiresAt?: Date | string | null;
  }> | null;
  [key: string]: unknown;
}

/**
 * Returns the default end date for a lease given its start date:
 * exactly 1 year after start date (same day and month next year).
 */
export function defaultEndDate(start: string): string {
  if (!start) return "";
  const parts = start.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const targetYear = year + 1;
      const daysInMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
      const targetDay = Math.min(day, daysInMonth);
      return `${targetYear}-${month.toString().padStart(2, "0")}-${targetDay.toString().padStart(2, "0")}`;
    }
  }
  const d = new Date(start);
  if (isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

export type LeaseDisplayStatus =
  | "upcoming"
  | "active"
  | "ended"
  | "moved_out"
  | "pending"
  | "invite_sent"
  | "invite_expired";

/**
 * Returns the user-facing display status for a lease:
 * - "moved_out": terminatedAt is set
 * - "pending" / "invite_sent" / "invite_expired": awaiting tenant invitation response
 * - "upcoming": today < startDate
 * - "ended": today > endDate
 * - "active": startDate <= today <= endDate
 */
export function getLeaseDisplayStatus(
  lease: LeaseLike,
  today: Date | string = new Date()
): LeaseDisplayStatus {
  if (lease.terminatedAt) {
    return "moved_out";
  }
  if (lease.status === "pending") {
    if (lease.invitationExpiresAt && new Date(lease.invitationExpiresAt) < new Date(today)) {
      return "invite_expired";
    }
    return "pending";
  }
  if (lease.inviteCodes && lease.inviteCodes.length > 0) {
    const unredeemed = lease.inviteCodes.find((c) => !c.redeemedAt);
    if (unredeemed) {
      if (unredeemed.expiresAt && new Date(unredeemed.expiresAt) < new Date(today)) {
        return "invite_expired";
      }
      return "invite_sent";
    }
  }

  const todayStr = formatLagosYMD(today);
  const startStr = formatLagosYMD(lease.startDate);

  if (todayStr < startStr) {
    return "upcoming";
  }
  if (lease.endDate) {
    const endStr = formatLagosYMD(lease.endDate);
    if (todayStr > endStr) {
      return "ended";
    }
  }
  return "active";
}

export interface RenewEligibility {
  eligible: boolean;
  reason?: "not_ended" | "moved_out" | "unpaid" | "has_later_lease";
  unpaidAmount?: number;
  message?: string;
}

/**
 * Checks whether a lease is eligible for renewal:
 * - Allowed only on/after the source lease end date
 * - When confirmed payments >= totalLeaseRent for the whole lease
 * - Not moved out (terminatedAt is null)
 * - No later lease exists on the unit
 */
export function getRenewEligibility(
  lease: LeaseLike,
  confirmedPayments: PaymentLike[] = [],
  today: Date | string = new Date(),
  allUnitLeases: LeaseLike[] = []
): RenewEligibility {
  if (lease.terminatedAt) {
    return { eligible: false, reason: "moved_out", message: "Tenant has moved out." };
  }

  if (!lease.endDate) {
    return { eligible: false, reason: "not_ended", message: "Open-ended leases do not require renewal." };
  }

  const todayStr = formatLagosYMD(today);
  const endStr = formatLagosYMD(lease.endDate);

  if (todayStr < endStr) {
    return { eligible: false, reason: "not_ended", message: "Lease has not reached its end date." };
  }

  // Check if a later lease already exists on the unit
  const hasLaterLease = allUnitLeases.some((l) => {
    if (l === lease || (l.id && lease.id && l.id === lease.id)) return false;
    if (l.terminatedAt || l.status === "declined" || l.status === "cancelled") return false;
    const startStr = formatLagosYMD(l.startDate);
    return startStr >= endStr;
  });

  if (hasLaterLease) {
    return {
      eligible: false,
      reason: "has_later_lease",
      message: "A renewed or later lease already exists for this unit.",
    };
  }

  // Check confirmed payments vs total lease rent
  const rentAmount = Number(lease.rentAmount || 0);
  const periodStarts = getPeriodStarts({
    startDate: lease.startDate,
    endDate: lease.endDate,
    rentFrequency: (lease.rentFrequency as string) || "monthly",
  });
  const totalLeaseRent = rentAmount * periodStarts.length;

  const confirmedPaid = confirmedPayments
    .filter((p) => !p.status || p.status === "confirmed")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const unpaidAmount = Math.max(0, totalLeaseRent - confirmedPaid);

  if (unpaidAmount > 0) {
    return {
      eligible: false,
      reason: "unpaid",
      unpaidAmount,
      message: `${formatCurrency(unpaidAmount)} still unpaid on this lease`,
    };
  }

  return { eligible: true };
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
    const endStr = l.endDate ? formatLagosYMD(l.endDate) : null;
    return startStr <= todayStr && (!endStr || todayStr <= endStr);
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
  const past = activeLeases.filter((l) => l.endDate && formatLagosYMD(l.endDate) < todayStr);
  if (past.length > 0) {
    past.sort((a, b) => formatLagosYMD(b.endDate!).localeCompare(formatLagosYMD(a.endDate!)));
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

  if (!baseLease || !baseLease.endDate) return null;

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
    const endStr = current.endDate ? formatLagosYMD(current.endDate) : null;

    if (startStr <= todayStr && (!endStr || todayStr <= endStr)) {
      return "occupied";
    }

    if (startStr > todayStr) {
      return "reserved";
    }

    // Ended lease: todayStr > endStr
    // An ended, not moved out (terminatedAt is empty), not renewed lease still counts as occupied
    if (!current.terminatedAt) {
      return "occupied";
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
