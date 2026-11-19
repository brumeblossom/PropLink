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
 * Generates all period start dates for a lease on or before lease.endDate.
 */
export function getPeriodStarts(lease: Pick<LeaseLike, "startDate" | "endDate" | "rentFrequency">): Date[] {
  const start = getLagosYMD(lease.startDate);
  const endStr = formatLagosYMD(lease.endDate);
  const stepMonths = getStepMonths(lease.rentFrequency);
  const starts: Date[] = [];

  for (let n = 0; n < 1200; n++) {
    const p = computePeriodStartDate(start.year, start.month, start.day, n, stepMonths);
    const pStr = formatLagosYMD(p.date);
    if (pStr > endStr) {
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
 * Computes the running balance for a lease given its confirmed payments and current date.
 */
export function getLeaseBalance(
  lease: LeaseLike,
  confirmedPayments: PaymentLike[],
  todayInput: Date | string = new Date()
): LeaseBalanceResult {
  const rentAmount = Number(lease.rentAmount || 0);
  const isRentSet = rentAmount > 0;
  const currentPeriod = getRentPeriodForDate(lease, todayInput);

  // Sum confirmed payments only
  const paidToDate = confirmedPayments
    .filter((p) => !p.status || p.status === "confirmed")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

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
      periodStart: currentPeriod.periodStart,
      periodEnd: currentPeriod.periodEnd,
      amountPaid: paidToDate,
      amountOutstanding: 0,
    };
  }

  const periodStarts = getPeriodStarts(lease);
  const todayStr = formatLagosYMD(todayInput);

  // Periods due: period starts on or before today (and on or before endDate, which getPeriodStarts already guarantees)
  const periodsDue = periodStarts.filter((p) => formatLagosYMD(p) <= todayStr).length;
  const rentDueToDate = rentAmount * periodsDue;

  const rawDiff = rentDueToDate - paidToDate;
  const outstanding = Math.max(0, rawDiff);
  const credit = rawDiff < 0 ? Math.abs(rawDiff) : 0;

  // nextDueDate: start of the first period not fully covered by paidToDate
  let remainingPaid = paidToDate;
  let nextDueDate: Date | null = null;

  for (const p of periodStarts) {
    if (remainingPaid >= rentAmount) {
      remainingPaid -= rentAmount;
    } else {
      nextDueDate = p;
      break;
    }
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
    periodStart: currentPeriod.periodStart,
    periodEnd: currentPeriod.periodEnd,
    amountPaid: paidToDate,
    amountOutstanding: outstanding,
  };
}
