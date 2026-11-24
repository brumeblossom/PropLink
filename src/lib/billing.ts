// src/lib/billing.ts

export interface LeaseLike {
  startDate: Date | string;
  endDate: Date | string;
  rentAmount: number | string | bigint | { toString(): string } | null;
  rentFrequency: string;
}

export interface PaymentLike {
  amount: number | string | bigint | { toString(): string };
  status?: string | null;
}

export interface LeaseBalanceResult {
  rentDueToDate: number;
  paidToDate: number;
  outstanding: number;
  credit: number;
  nextDueDate: Date | null;
  periodsDue: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  rentAmount: number;
  isRentSet: boolean;
  totalPeriods: number;
  totalLeaseRent: number;
  remainingLeaseRent: number;
  pendingAmount: number;
  unpaidPeriods: number;
  // Backwards compatibility aliases
  periodStart: Date;
  periodEnd: Date;
  amountPaid: number;
  amountOutstanding: number;
}

/**
 * Returns the year, month (1-12), and day (1-31) of a date in Africa/Lagos time (UTC+1, no DST).
 */
export function getLagosYMD(dateInput: Date | string): { year: number; month: number; day: number } {
  if (typeof dateInput === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
    if (match) {
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10),
        day: parseInt(match[3], 10),
      };
    }
  }

  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(d);
  let year = 0;
  let month = 0;
  let day = 0;

  for (const part of parts) {
    if (part.type === "year") year = parseInt(part.value, 10);
    if (part.type === "month") month = parseInt(part.value, 10);
    if (part.type === "day") day = parseInt(part.value, 10);
  }

  return { year, month, day };
}

/**
 * Formats a date as YYYY-MM-DD in Africa/Lagos time.
 */
export function formatLagosYMD(dateInput: Date | string): string {
  const { year, month, day } = getLagosYMD(dateInput);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

/**
 * Formats a date as DD/MM/YYYY in Africa/Lagos time.
 */
export function formatDateGB(dateInput: Date | string): string {
  const { year, month, day } = getLagosYMD(dateInput);
  return `${day.toString().padStart(2, "0")}/${month.toString().padStart(2, "0")}/${year.toString().padStart(4, "0")}`;
}

/**
 * Creates a Date corresponding to Lagos midnight / UTC midnight for consistency in Postgres @db.Date.
 */
export function createLagosDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

/**
 * Returns the period step in months for a given rent frequency.
 */
export function getStepMonths(rentFrequency: string): number {
  switch (rentFrequency?.toLowerCase()) {
    case "annually":
    case "annual":
    case "yearly":
      return 12;
    case "quarterly":
    case "quarter":
      return 3;
    case "monthly":
    default:
      return 1;
  }
}

/**
 * Computes period start date n steps after start date, clamping to last day of month if necessary.
 * Always computed from startDate + n months (not cumulatively from previous period).
 */
export function computePeriodStartDate(
  startYear: number,
  startMonth: number,
  startDay: number,
  n: number,
  stepMonths: number
): { year: number; month: number; day: number; date: Date } {
  const totalMonths = (startMonth - 1) + n * stepMonths;
  const targetYear = startYear + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12 + 1; // 1-12
  // Days in targetMonth of targetYear: Date.UTC with day 0 gives last day of targetMonth
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(startDay, daysInMonth);
  return {
    year: targetYear,
    month: targetMonth,
    day: targetDay,
    date: createLagosDate(targetYear, targetMonth, targetDay),
  };
}

/**
 * Generates all period start dates for a lease strictly before lease.endDate.
 * A period that starts on or after endDate is not a rent period.
 */
export function getPeriodStarts(lease: Pick<LeaseLike, "startDate" | "endDate" | "rentFrequency">): Date[] {
  const start = getLagosYMD(lease.startDate);
  const endStr = formatLagosYMD(lease.endDate);
  const freq = lease.rentFrequency?.toLowerCase();

  if (freq === "weekly" || freq === "week") {
    const starts: Date[] = [];
    let current = createLagosDate(start.year, start.month, start.day);
    while (formatLagosYMD(current) < endStr) {
      starts.push(new Date(current));
      current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 7, 0, 0, 0));
    }
    return starts;
  }

  const stepMonths = getStepMonths(lease.rentFrequency);
  const starts: Date[] = [];

  for (let n = 0; n < 1200; n++) {
    const p = computePeriodStartDate(start.year, start.month, start.day, n, stepMonths);
    const pStr = formatLagosYMD(p.date);
    if (pStr >= endStr) {
      break;
    }
    starts.push(p.date);
  }

  return starts;
}

/**
 * Finds the rent period { periodStart, periodEnd } that contains paymentDate.
 */
export function getRentPeriodForDate(
  lease: Pick<LeaseLike, "startDate" | "endDate" | "rentFrequency">,
  dateInput: Date | string
): { periodStart: Date; periodEnd: Date } {
  const pStarts = getPeriodStarts(lease);
  const leaseStart = typeof lease.startDate === "string" ? new Date(lease.startDate) : lease.startDate;
  const leaseEnd = typeof lease.endDate === "string" ? new Date(lease.endDate) : lease.endDate;

  if (pStarts.length === 0) {
    return {
      periodStart: leaseStart,
      periodEnd: leaseEnd,
    };
  }

  const targetStr = formatLagosYMD(dateInput);
  let k = 0;

  if (targetStr < formatLagosYMD(pStarts[0])) {
    k = 0;
  } else {
    for (let i = 0; i < pStarts.length; i++) {
      if (formatLagosYMD(pStarts[i]) <= targetStr) {
        k = i;
      } else {
        break;
      }
    }
  }

  const periodStart = pStarts[k];
  let periodEnd: Date;

  if (k < pStarts.length - 1) {
    // Ends day before next period start
    const nextStart = pStarts[k + 1];
    const dayBefore = new Date(nextStart.getTime() - 24 * 60 * 60 * 1000);
    periodEnd = dayBefore > leaseEnd ? leaseEnd : dayBefore;
  } else {
    periodEnd = leaseEnd;
  }

  return { periodStart, periodEnd };
}

/**
 * Returns the date one day after the given date in Africa/Lagos time.
 */
export function getDayAfter(dateInput: Date | string): Date {
  const { year, month, day } = getLagosYMD(dateInput);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  const nextYMD = getLagosYMD(next);
  return createLagosDate(nextYMD.year, nextYMD.month, nextYMD.day);
}

/**
 * Returns the due dates for all periods of a lease.
 * A period's due date = its end date: the next period's start, or the lease end date for the last period.
 */
export function getPeriodDueDates(
  lease: Pick<LeaseLike, "startDate" | "endDate" | "rentFrequency">
): Date[] {
  const starts = getPeriodStarts(lease);
  if (starts.length === 0) return [];

  const dueDates: Date[] = [];
  const endYMD = getLagosYMD(lease.endDate);
  const leaseEndDate = createLagosDate(endYMD.year, endYMD.month, endYMD.day);

  for (let i = 0; i < starts.length; i++) {
    if (i < starts.length - 1) {
      dueDates.push(starts[i + 1]);
    } else {
      dueDates.push(leaseEndDate);
    }
  }

  return dueDates;
}

/**
 * Evaluates the status and display text for the due date line under summary tiles.
 */
export function getDueDateStatus(
  nextDueDate: Date | string | null,
  endDate: Date | string,
  todayInput: Date | string = new Date(),
  unpaidPeriods: number = 0
): {
  status: "overdue" | "today" | "upcoming" | "paid_in_full";
  text: string;
} {
  if (!nextDueDate) {
    const endStr = formatDateGB(endDate);
    return {
      status: "paid_in_full",
      text: `Paid to end of lease (${endStr})`,
    };
  }

  const dueStr = formatLagosYMD(nextDueDate);
  const todayStr = formatLagosYMD(todayInput);
  const dueFormatted = formatDateGB(nextDueDate);

  if (dueStr < todayStr) {
    const periodsCount = Math.max(1, unpaidPeriods);
    const periodsText = periodsCount === 1 ? "1 unpaid period" : `${periodsCount} unpaid periods`;
    const dayAfter = getDayAfter(nextDueDate);
    const overdueSinceFormatted = formatDateGB(dayAfter);
    return {
      status: "overdue",
      text: `Overdue since ${overdueSinceFormatted} · ${periodsText}`,
    };
  } else if (dueStr === todayStr) {
    return {
      status: "today",
      text: "Rent due today",
    };
  } else {
    return {
      status: "upcoming",
      text: `Next rent due ${dueFormatted}`,
    };
  }
}

export interface RentDueLines {
  line1: string;
  line2?: string | null;
  status: "overdue" | "upcoming" | "paid_in_full" | "expired";
}

/**
 * Formats next rent due into two compact lines for table cells and card layouts.
 */
export function formatTwoLineRentDue({
  leaseStatus,
  nextDueDate,
  unpaidPeriods = 0,
  startDate,
  todayInput = new Date(),
}: {
  leaseStatus: string;
  nextDueDate: Date | string | null;
  unpaidPeriods?: number;
  startDate?: Date | string | null;
  todayInput?: Date | string;
}): RentDueLines {
  if (
    leaseStatus === "expired" ||
    leaseStatus === "terminated" ||
    leaseStatus === "pending" ||
    leaseStatus === "invite_sent" ||
    leaseStatus === "invite_expired"
  ) {
    return { line1: "—", status: "expired" };
  }

  if (!nextDueDate) {
    return { line1: "Paid to end of lease", status: "paid_in_full" };
  }

  const todayStr = formatLagosYMD(todayInput);
  const dueStr = formatLagosYMD(nextDueDate);

  if (dueStr < todayStr) {
    const periodsCount = Math.max(1, unpaidPeriods);
    const periodWord = periodsCount === 1 ? "1 period" : `${periodsCount} periods`;
    const dayAfter = getDayAfter(nextDueDate);
    return {
      line1: `Overdue · ${periodWord}`,
      line2: `since ${formatDateGB(dayAfter)}`,
      status: "overdue",
    };
  }

  const dueDateFormatted = formatDateGB(nextDueDate);

  // Check if upcoming lease with different start date
  if (leaseStatus === "upcoming" && startDate) {
    const startFormatted = formatDateGB(startDate);
    if (startFormatted !== dueDateFormatted) {
      return {
        line1: dueDateFormatted,
        line2: `Lease starts ${startFormatted}`,
        status: "upcoming",
      };
    }
  }

  // Calculate days difference
  const target = getLagosYMD(nextDueDate);
  const current = getLagosYMD(todayInput);
  const d1 = Date.UTC(target.year, target.month - 1, target.day);
  const d2 = Date.UTC(current.year, current.month - 1, current.day);
  const days = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));

  let relativeText = "";
  if (days <= 0) {
    relativeText = "today";
  } else if (days === 1) {
    relativeText = "tomorrow";
  } else {
    relativeText = `in ${days} days`;
  }

  return {
    line1: dueDateFormatted,
    line2: relativeText,
    status: "upcoming",
  };
}

/**
 * Computes the running balance for a lease given its confirmed payments, pending payments, and current date.
 */
export function getLeaseBalance(
  lease: LeaseLike,
  confirmedPayments: PaymentLike[],
  todayInput: Date | string = new Date(),
  pendingPayments: PaymentLike[] = []
): LeaseBalanceResult {
  const rentAmount = Number(lease.rentAmount || 0);
  const isRentSet = rentAmount > 0;
  const currentPeriod = getRentPeriodForDate(lease, todayInput);

  // Sum confirmed payments
  const confirmed = confirmedPayments.filter((p) => !p.status || p.status === "confirmed");
  const paidToDate = confirmed.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Sum pending payments
  const pending = pendingPayments.length > 0
    ? pendingPayments
    : confirmedPayments.filter((p) => p.status === "pending");
  const pendingAmount = pending.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const periodStarts = getPeriodStarts(lease);
  const periodDueDates = getPeriodDueDates(lease);
  const totalPeriods = periodStarts.length;
  const totalLeaseRent = isRentSet ? rentAmount * totalPeriods : 0;
  const remainingLeaseRent = isRentSet ? Math.max(0, totalLeaseRent - paidToDate - pendingAmount) : 0;

  if (!isRentSet) {
    return {
      rentDueToDate: 0,
      paidToDate,
      outstanding: 0,
      credit: 0,
      nextDueDate: null,
      periodsDue: 0,
      currentPeriodStart: currentPeriod.periodStart,
      currentPeriodEnd: currentPeriod.periodEnd,
      rentAmount: 0,
      isRentSet: false,
      totalPeriods,
      totalLeaseRent: 0,
      remainingLeaseRent: 0,
      pendingAmount,
      unpaidPeriods: 0,
      periodStart: currentPeriod.periodStart,
      periodEnd: currentPeriod.periodEnd,
      amountPaid: paidToDate,
      amountOutstanding: 0,
    };
  }

  const todayStr = formatLagosYMD(todayInput);

  // Periods due: periods whose due date is on or before today
  const periodsDue = periodDueDates.filter((d) => formatLagosYMD(d) <= todayStr).length;
  const rentDueToDate = rentAmount * periodsDue;

  const rawDiff = rentDueToDate - paidToDate;
  const outstanding = Math.max(0, rawDiff);
  const credit = rawDiff < 0 ? Math.abs(rawDiff) : 0;

  // nextDueDate: due date (end) of the first period not fully covered by confirmed payments
  let remainingPaid = paidToDate;
  let nextDueDate: Date | null = null;
  let uncoveredPeriodIndex = -1;

  for (let i = 0; i < periodDueDates.length; i++) {
    if (remainingPaid >= rentAmount) {
      remainingPaid -= rentAmount;
    } else {
      nextDueDate = periodDueDates[i];
      uncoveredPeriodIndex = i;
      break;
    }
  }

  // Count unpaid periods among finished periods that aren't covered
  let unpaidPeriods = 0;
  if (uncoveredPeriodIndex !== -1 && uncoveredPeriodIndex < periodsDue) {
    unpaidPeriods = periodsDue - uncoveredPeriodIndex;
  }

  return {
    rentDueToDate,
    paidToDate,
    outstanding,
    credit,
    nextDueDate,
    periodsDue,
    currentPeriodStart: currentPeriod.periodStart,
    currentPeriodEnd: currentPeriod.periodEnd,
    rentAmount,
    isRentSet: true,
    totalPeriods,
    totalLeaseRent,
    remainingLeaseRent,
    pendingAmount,
    unpaidPeriods,
    periodStart: currentPeriod.periodStart,
    periodEnd: currentPeriod.periodEnd,
    amountPaid: paidToDate,
    amountOutstanding: outstanding,
  };
}
