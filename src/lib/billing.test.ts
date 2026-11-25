// src/lib/billing.test.ts
import { describe, it, expect } from "vitest";
import {
  getPeriodStarts,
  getPeriodDueDates,
  getRentPeriodForDate,
  getLeaseBalance,
  getDueDateStatus,
  formatTwoLineRentDue,
  formatLagosYMD,
  PaymentLike,
} from "./billing";

describe("Billing & Running Balance", () => {
  it("annual 1-year lease = 1 period (20/07/2026–20/07/2027)", () => {
    const lease = {
      startDate: new Date("2026-07-20T00:00:00.000Z"),
      endDate: new Date("2027-07-20T00:00:00.000Z"),
      rentFrequency: "annually",
    };
    const starts = getPeriodStarts(lease);
    expect(starts.length).toBe(1);
    expect(formatLagosYMD(starts[0])).toBe("2026-07-20");

    const dueDates = getPeriodDueDates(lease);
    expect(dueDates.length).toBe(1);
    expect(formatLagosYMD(dueDates[0])).toBe("2027-07-20");
  });

  it("monthly 29/07/2026–29/07/2027 = 12 periods", () => {
    const lease = {
      startDate: new Date("2026-07-29T00:00:00.000Z"),
      endDate: new Date("2027-07-29T00:00:00.000Z"),
      rentFrequency: "monthly",
    };
    const starts = getPeriodStarts(lease);
    expect(starts.length).toBe(12);
    expect(formatLagosYMD(starts[0])).toBe("2026-07-29");
    expect(formatLagosYMD(starts[11])).toBe("2027-06-29");

    const dueDates = getPeriodDueDates(lease);
    expect(dueDates.length).toBe(12);
    expect(formatLagosYMD(dueDates[0])).toBe("2026-08-29");
    expect(formatLagosYMD(dueDates[11])).toBe("2027-07-29");
  });

  it("Flat2 example: 20/07/2026–20/07/2027, ₦1.5m annually, ₦1.5m paid → nextDueDate null", () => {
    const lease = {
      startDate: new Date("2026-07-20T00:00:00.000Z"),
      endDate: new Date("2027-07-20T00:00:00.000Z"),
      rentAmount: 1500000,
      rentFrequency: "annually",
    };
    const confirmedPayments = [{ amount: 1500000, status: "confirmed" }];
    const today = new Date("2026-11-19T12:00:00.000Z");

    const result = getLeaseBalance(lease, confirmedPayments, today);
    expect(result.totalPeriods).toBe(1);
    expect(result.totalLeaseRent).toBe(1500000);
    expect(result.remainingLeaseRent).toBe(0);
    expect(result.outstanding).toBe(0);
    expect(result.nextDueDate).toBeNull();

    const status = getDueDateStatus(result.nextDueDate, lease.endDate, today);
    expect(status.status).toBe("paid_in_full");
    expect(status.text).toBe("Paid to end of lease (20/07/2027)");
  });

  it("Monthly ₦100,000 from 12/07/2026, today 23/11/2026: rentDueToDate 400,000, nextDueDate 12/12/2026 (nothing paid → overdue since 13/08/2026, 4 unpaid periods)", () => {
    const lease = {
      startDate: "2026-07-12",
      endDate: "2027-07-12",
      rentAmount: 100000,
      rentFrequency: "monthly",
    };
    const today = "2026-11-23";

    const result = getLeaseBalance(lease, [], today);
    expect(result.periodsDue).toBe(4);
    expect(result.rentDueToDate).toBe(400000);
    expect(result.paidToDate).toBe(0);
    expect(result.outstanding).toBe(400000);
    expect(result.unpaidPeriods).toBe(4);
    expect(result.nextDueDate).not.toBeNull();
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2026-08-12");

    const status = getDueDateStatus(result.nextDueDate, lease.endDate, today, result.unpaidPeriods);
    expect(status.status).toBe("overdue");
    expect(status.text).toBe("Overdue since 13/08/2026 · 4 unpaid periods");

    const twoLine = formatTwoLineRentDue({
      leaseStatus: "active",
      nextDueDate: result.nextDueDate,
      unpaidPeriods: result.unpaidPeriods,
      todayInput: today,
    });
    expect(twoLine.status).toBe("overdue");
    expect(twoLine.line1).toBe("Overdue · 4 periods");
    expect(twoLine.line2).toBe("since 13/08/2026");
  });

  it("Same lease with ₦400,000 confirmed: outstanding 0, next due 12/12/2026, not overdue", () => {
    const lease = {
      startDate: "2026-07-12",
      endDate: "2027-07-12",
      rentAmount: 100000,
      rentFrequency: "monthly",
    };
    const today = "2026-11-23";
    const confirmedPayments = [{ amount: 400000, status: "confirmed" }];

    const result = getLeaseBalance(lease, confirmedPayments, today);
    expect(result.periodsDue).toBe(4);
    expect(result.rentDueToDate).toBe(400000);
    expect(result.paidToDate).toBe(400000);
    expect(result.outstanding).toBe(0);
    expect(result.credit).toBe(0);
    expect(result.unpaidPeriods).toBe(0);
    expect(result.nextDueDate).not.toBeNull();
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2026-12-12");

    const status = getDueDateStatus(result.nextDueDate, lease.endDate, today, result.unpaidPeriods);
    expect(status.status).toBe("upcoming");
    expect(status.text).toBe("Next rent due 12/12/2026");

    const twoLine = formatTwoLineRentDue({
      leaseStatus: "active",
      nextDueDate: result.nextDueDate,
      unpaidPeriods: result.unpaidPeriods,
      todayInput: today,
    });
    expect(twoLine.status).toBe("upcoming");
    expect(twoLine.line1).toBe("12/12/2026");
  });

  it("Yearly ₦800,000 from 18/11/2026 to 18/11/2027, today 20/11/2026: rentDueToDate 0, not overdue, next due 18/11/2027", () => {
    const lease = {
      startDate: "2026-11-18",
      endDate: "2027-11-18",
      rentAmount: 800000,
      rentFrequency: "yearly",
    };
    const today = "2026-11-20";

    const result = getLeaseBalance(lease, [], today);
    expect(result.periodsDue).toBe(0);
    expect(result.rentDueToDate).toBe(0);
    expect(result.paidToDate).toBe(0);
    expect(result.outstanding).toBe(0);
    expect(result.credit).toBe(0);
    expect(result.unpaidPeriods).toBe(0);
    expect(result.nextDueDate).not.toBeNull();
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2027-11-18");

    const status = getDueDateStatus(result.nextDueDate, lease.endDate, today, result.unpaidPeriods);
    expect(status.status).toBe("upcoming");
    expect(status.text).toBe("Next rent due 18/11/2027");
  });

  it("Same yearly lease, today 19/11/2027, ₦600,000 paid: outstanding 200,000, overdue since 19/11/2027", () => {
    const lease = {
      startDate: "2026-11-18",
      endDate: "2027-11-18",
      rentAmount: 800000,
      rentFrequency: "yearly",
    };
    const today = "2027-11-19";
    const confirmedPayments = [{ amount: 600000, status: "confirmed" }];

    const result = getLeaseBalance(lease, confirmedPayments, today);
    expect(result.periodsDue).toBe(1);
    expect(result.rentDueToDate).toBe(800000);
    expect(result.paidToDate).toBe(600000);
    expect(result.outstanding).toBe(200000);
    expect(result.credit).toBe(0);
    expect(result.unpaidPeriods).toBe(1);
    expect(result.nextDueDate).not.toBeNull();
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2027-11-18");

    const status = getDueDateStatus(result.nextDueDate, lease.endDate, today, result.unpaidPeriods);
    expect(status.status).toBe("overdue");
    expect(status.text).toBe("Overdue since 19/11/2027 · 1 unpaid period");

    const twoLine = formatTwoLineRentDue({
      leaseStatus: "active",
      nextDueDate: result.nextDueDate,
      unpaidPeriods: result.unpaidPeriods,
      todayInput: today,
    });
    expect(twoLine.status).toBe("overdue");
    expect(twoLine.line1).toBe("Overdue · 1 period");
    expect(twoLine.line2).toBe("since 19/11/2027");
  });

  it("Due date line wording states: overdue, today, upcoming, paid to end of lease", () => {
    const endDate = "2027-07-20";
    const today = new Date("2026-11-19T12:00:00.000Z");

    // Overdue (due 2026-10-20 -> overdue since 21/10/2026)
    const overdueStatus = getDueDateStatus(new Date("2026-10-20T00:00:00.000Z"), endDate, today, 2);
    expect(overdueStatus.status).toBe("overdue");
    expect(overdueStatus.text).toBe("Overdue since 21/10/2026 · 2 unpaid periods");

    // Due today
    const todayStatus = getDueDateStatus(new Date("2026-11-19T00:00:00.000Z"), endDate, today);
    expect(todayStatus.status).toBe("today");
    expect(todayStatus.text).toBe("Rent due today");

    // Upcoming
    const upcomingStatus = getDueDateStatus(new Date("2026-12-20T00:00:00.000Z"), endDate, today);
    expect(upcomingStatus.status).toBe("upcoming");
    expect(upcomingStatus.text).toBe("Next rent due 20/12/2026");

    // Paid in full
    const paidStatus = getDueDateStatus(null, endDate, today);
    expect(paidStatus.status).toBe("paid_in_full");
    expect(paidStatus.text).toBe("Paid to end of lease (20/07/2027)");
  });

  it("Payment limit and remainingLeaseRent with pending payments", () => {
    const lease = {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-07-01T00:00:00.000Z"), // 6 months
      rentAmount: 100000,
      rentFrequency: "monthly",
    };
    const confirmedPayments = [{ amount: 200000, status: "confirmed" }];
    const pendingPayments = [{ amount: 100000, status: "pending" }];
    const today = new Date("2026-03-15T12:00:00.000Z");

    const result = getLeaseBalance(lease, confirmedPayments, today, pendingPayments);

    expect(result.totalPeriods).toBe(6);
    expect(result.totalLeaseRent).toBe(600000);
    // remaining = 600,000 - 200,000 (confirmed) - 100,000 (pending) = 300,000
    expect(result.remainingLeaseRent).toBe(300000);
    expect(result.pendingAmount).toBe(100000);
  });

  it("Partial payment: ₦800k monthly, ₦400k paid, checked after period 1 ends → ₦400k outstanding, next due date is period 1 due date", () => {
    const lease = {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2027-01-01T00:00:00.000Z"),
      rentAmount: 800000,
      rentFrequency: "monthly",
    };
    const confirmedPayments = [{ amount: 400000, status: "confirmed" }];
    const today = new Date("2026-02-15T12:00:00.000Z"); // Month 1 ended on 2026-02-01

    const result = getLeaseBalance(lease, confirmedPayments, today);

    expect(result.periodsDue).toBe(1);
    expect(result.rentDueToDate).toBe(800000);
    expect(result.paidToDate).toBe(400000);
    expect(result.outstanding).toBe(400000);
    expect(result.credit).toBe(0);
    expect(result.unpaidPeriods).toBe(1);
    expect(result.nextDueDate).not.toBeNull();
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2026-02-01");
  });

  it("Payment in advance: ₦100k rent, ₦300k paid on month 1 → ₦0 outstanding, credit ₦200k, next due date month 4 due date", () => {
    const lease = {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2027-01-01T00:00:00.000Z"),
      rentAmount: 100000,
      rentFrequency: "monthly",
    };
    const confirmedPayments = [{ amount: 300000, status: "confirmed" }];
    const today = new Date("2026-02-15T12:00:00.000Z"); // Month 1 due 2026-02-01

    const result = getLeaseBalance(lease, confirmedPayments, today);

    expect(result.periodsDue).toBe(1);
    expect(result.rentDueToDate).toBe(100000);
    expect(result.paidToDate).toBe(300000);
    expect(result.outstanding).toBe(0);
    expect(result.credit).toBe(200000);
    expect(result.nextDueDate).not.toBeNull();
    // Month 4 due date is 2026-05-01 (covers months due 02-01, 03-01, 04-01)
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2026-05-01");
  });

  it("31st-of-month start date: Jan 31 → Feb 28 → Mar 31 → Apr 30", () => {
    const lease = {
      startDate: new Date("2026-01-31T00:00:00.000Z"),
      endDate: new Date("2026-05-31T00:00:00.000Z"),
      rentFrequency: "monthly",
    };

    const starts = getPeriodStarts(lease);
    const formatted = starts.map((d) => formatLagosYMD(d));

    expect(formatted).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);

    const dueDates = getPeriodDueDates(lease);
    expect(dueDates.map((d) => formatLagosYMD(d))).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("Rent not set (rentAmount 0): isRentSet is false, numbers are 0", () => {
    const lease = {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      rentAmount: 0,
      rentFrequency: "monthly",
    };
    const confirmedPayments: PaymentLike[] = [];
    const today = new Date("2026-05-01T12:00:00.000Z");

    const result = getLeaseBalance(lease, confirmedPayments, today);

    expect(result.isRentSet).toBe(false);
    expect(result.rentDueToDate).toBe(0);
    expect(result.paidToDate).toBe(0);
    expect(result.outstanding).toBe(0);
    expect(result.credit).toBe(0);
    expect(result.totalLeaseRent).toBe(0);
    expect(result.remainingLeaseRent).toBe(0);
    expect(result.nextDueDate).toBeNull();
  });

  it("getRentPeriodForDate finds correct containing period", () => {
    const lease = {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      rentFrequency: "monthly",
    };

    const p1 = getRentPeriodForDate(lease, "2026-01-15");
    expect(formatLagosYMD(p1.periodStart)).toBe("2026-01-01");
    expect(formatLagosYMD(p1.periodEnd)).toBe("2026-01-31");

    const p2 = getRentPeriodForDate(lease, "2026-02-05");
    expect(formatLagosYMD(p2.periodStart)).toBe("2026-02-01");
    expect(formatLagosYMD(p2.periodEnd)).toBe("2026-02-28");

    // Before start date maps to first period
    const pEarly = getRentPeriodForDate(lease, "2025-12-25");
    expect(formatLagosYMD(pEarly.periodStart)).toBe("2026-01-01");
  });

  describe("formatTwoLineRentDue", () => {
    const today = new Date("2026-11-20T12:00:00.000Z");

    it("expired lease returns —", () => {
      const result = formatTwoLineRentDue({
        leaseStatus: "expired",
        nextDueDate: null,
        todayInput: today,
      });
      expect(result.status).toBe("expired");
      expect(result.line1).toBe("—");
      expect(result.line2).toBeUndefined();
    });

    it("paid to end of lease returns Paid to end of lease", () => {
      const result = formatTwoLineRentDue({
        leaseStatus: "active",
        nextDueDate: null,
        todayInput: today,
      });
      expect(result.status).toBe("paid_in_full");
      expect(result.line1).toBe("Paid to end of lease");
      expect(result.line2).toBeUndefined();
    });

    it("overdue returns Overdue · N periods and since DD/MM/YYYY (day after due date)", () => {
      const result = formatTwoLineRentDue({
        leaseStatus: "active",
        nextDueDate: "2026-06-29",
        unpaidPeriods: 5,
        todayInput: today,
      });
      expect(result.status).toBe("overdue");
      expect(result.line1).toBe("Overdue · 5 periods");
      expect(result.line2).toBe("since 30/06/2026");

      const singleResult = formatTwoLineRentDue({
        leaseStatus: "active",
        nextDueDate: "2026-10-20",
        unpaidPeriods: 1,
        todayInput: today,
      });
      expect(singleResult.line1).toBe("Overdue · 1 period");
      expect(singleResult.line2).toBe("since 21/10/2026");
    });

    it("upcoming due date returns date and in N days / today / tomorrow", () => {
      // 97 days from 20/11/2026 is 25/02/2027
      const result = formatTwoLineRentDue({
        leaseStatus: "active",
        nextDueDate: "2027-02-25",
        todayInput: today,
      });
      expect(result.status).toBe("upcoming");
      expect(result.line1).toBe("25/02/2027");
      expect(result.line2).toBe("in 97 days");

      const todayResult = formatTwoLineRentDue({
        leaseStatus: "active",
        nextDueDate: "2026-11-20",
        todayInput: today,
      });
      expect(todayResult.line1).toBe("20/11/2026");
      expect(todayResult.line2).toBe("today");

      const tomorrowResult = formatTwoLineRentDue({
        leaseStatus: "active",
        nextDueDate: "2026-11-21",
        todayInput: today,
      });
      expect(tomorrowResult.line1).toBe("21/11/2026");
      expect(tomorrowResult.line2).toBe("tomorrow");
    });

    it("upcoming lease with different start date returns Lease starts DD/MM/YYYY", () => {
      const result = formatTwoLineRentDue({
        leaseStatus: "upcoming",
        nextDueDate: "2027-01-01",
        startDate: "2027-02-01",
        todayInput: today,
      });
      expect(result.status).toBe("upcoming");
      expect(result.line1).toBe("01/01/2027");
      expect(result.line2).toBe("Lease starts 01/02/2027");
    });
  });

  describe("Weekly Rent Frequency", () => {
    it("Weekly ₦20,000 from 01/12/2026, today 16/12/2026: 2 periods finished → 40,000", () => {
      const lease = {
        startDate: "2026-12-01",
        endDate: "2026-12-29", // 4 weeks
        rentAmount: 20000,
        rentFrequency: "weekly",
      };

      const starts = getPeriodStarts(lease);
      expect(starts.length).toBe(4);
      expect(formatLagosYMD(starts[0])).toBe("2026-12-01");
      expect(formatLagosYMD(starts[1])).toBe("2026-12-08");
      expect(formatLagosYMD(starts[2])).toBe("2026-12-15");
      expect(formatLagosYMD(starts[3])).toBe("2026-12-22");

      const dueDates = getPeriodDueDates(lease);
      expect(dueDates.length).toBe(4);
      expect(formatLagosYMD(dueDates[0])).toBe("2026-12-08");
      expect(formatLagosYMD(dueDates[1])).toBe("2026-12-15");
      expect(formatLagosYMD(dueDates[2])).toBe("2026-12-22");
      expect(formatLagosYMD(dueDates[3])).toBe("2026-12-29");

      // On 16/12/2026: 08/12 and 15/12 have finished -> 2 periods finished
      const today = "2026-12-16";
      const balance = getLeaseBalance(lease, [], today);

      expect(balance.periodsDue).toBe(2);
      expect(balance.rentDueToDate).toBe(40000);
      expect(balance.totalLeaseRent).toBe(4 * 20000);
      expect(balance.outstanding).toBe(40000);
      expect(balance.unpaidPeriods).toBe(2);
      expect(formatLagosYMD(balance.nextDueDate!)).toBe("2026-12-08");
    });
  });

  describe("Open-ended Leases (Rolling tenancies with no fixed end date)", () => {
    it("open-ended monthly lease: 4 finished periods means 4 × rent due; next due date is end of current period", () => {
      // Lease starts 2026-01-01, rent ₦50,000 monthly, no endDate
      const lease = {
        startDate: "2026-01-01",
        endDate: null,
        rentAmount: 50000,
        rentFrequency: "monthly",
      };

      // Periods:
      // P1: starts 2026-01-01, ends 2026-02-01 (due date 2026-02-01)
      // P2: starts 2026-02-01, ends 2026-03-01 (due date 2026-03-01)
      // P3: starts 2026-03-01, ends 2026-04-01 (due date 2026-04-01)
      // P4: starts 2026-04-01, ends 2026-05-01 (due date 2026-05-01)
      // P5: starts 2026-05-01, ends 2026-06-01 (current period on 2026-05-15, due date 2026-06-01)
      const today = "2026-05-15";

      // 4 payments of ₦50,000 cover the 4 finished periods
      const payments: PaymentLike[] = [
        { amount: 50000, status: "confirmed" },
        { amount: 50000, status: "confirmed" },
        { amount: 50000, status: "confirmed" },
        { amount: 50000, status: "confirmed" },
      ];

      const balance = getLeaseBalance(lease, payments, today);

      expect(balance.periodsDue).toBe(4);
      expect(balance.rentDueToDate).toBe(4 * 50000);
      expect(balance.paidToDate).toBe(200000);
      expect(balance.outstanding).toBe(0);
      expect(balance.credit).toBe(0);
      expect(balance.unpaidPeriods).toBe(0);
      expect(balance.remainingLeaseRent).toBe(0);

      // Next due date is the end of the current period (2026-06-01)
      expect(balance.nextDueDate).not.toBeNull();
      expect(formatLagosYMD(balance.nextDueDate!)).toBe("2026-06-01");
    });
  });
});
