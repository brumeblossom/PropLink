// src/lib/billing.test.ts
import { describe, it, expect } from "vitest";
import {
  getPeriodStarts,
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

  it("Flat3 example: starts 29/07/2026, ₦800k monthly, ₦600k paid, checked on 19/11/2026", () => {
    const lease = {
      startDate: new Date("2026-07-29T00:00:00.000Z"),
      endDate: new Date("2027-07-29T00:00:00.000Z"),
      rentAmount: 800000,
      rentFrequency: "monthly",
    };
    const confirmedPayments = [{ amount: 600000, status: "confirmed" }];
    const today = new Date("2026-11-19T12:00:00.000Z");

    const result = getLeaseBalance(lease, confirmedPayments, today);

    expect(result.totalPeriods).toBe(12);
    expect(result.totalLeaseRent).toBe(9600000); // 12 * 800,000
    expect(result.remainingLeaseRent).toBe(9000000); // 9,600,000 - 600,000
    expect(result.periodsDue).toBe(4); // July 29, Aug 29, Sep 29, Oct 29
    expect(result.rentDueToDate).toBe(3200000); // 4 * 800,000
    expect(result.paidToDate).toBe(600000);
    expect(result.outstanding).toBe(2600000);
    expect(result.credit).toBe(0);
    expect(result.nextDueDate).not.toBeNull();
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2026-07-29");
    expect(result.unpaidPeriods).toBe(4);

    const status = getDueDateStatus(result.nextDueDate, lease.endDate, today, result.unpaidPeriods);
    expect(status.status).toBe("overdue");
    expect(status.text).toBe("Overdue since 29/07/2026 · 4 unpaid periods");
  });

  it("Due date line wording states: overdue, today, upcoming, paid to end of lease", () => {
    const endDate = "2027-07-20";
    const today = new Date("2026-11-19T12:00:00.000Z");

    // Overdue
    const overdueStatus = getDueDateStatus(new Date("2026-10-20T00:00:00.000Z"), endDate, today, 2);
    expect(overdueStatus.status).toBe("overdue");
    expect(overdueStatus.text).toBe("Overdue since 20/10/2026 · 2 unpaid periods");

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

  it("Partial payment: ₦800k monthly, ₦400k paid in month 1 → ₦400k outstanding, next due date is current period", () => {
    const lease = {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2027-01-01T00:00:00.000Z"),
      rentAmount: 800000,
      rentFrequency: "monthly",
    };
    const confirmedPayments = [{ amount: 400000, status: "confirmed" }];
    const today = new Date("2026-01-15T12:00:00.000Z");

    const result = getLeaseBalance(lease, confirmedPayments, today);

    expect(result.periodsDue).toBe(1);
    expect(result.rentDueToDate).toBe(800000);
    expect(result.paidToDate).toBe(400000);
    expect(result.outstanding).toBe(400000);
    expect(result.credit).toBe(0);
    expect(result.nextDueDate).not.toBeNull();
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2026-01-01");
  });

  it("Payment in advance: ₦100k rent, ₦300k paid on month 1 → ₦0 outstanding, credit ₦200k, next due date month 4", () => {
    const lease = {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2027-01-01T00:00:00.000Z"),
      rentAmount: 100000,
      rentFrequency: "monthly",
    };
    const confirmedPayments = [{ amount: 300000, status: "confirmed" }];
    const today = new Date("2026-01-15T12:00:00.000Z"); // Month 1

    const result = getLeaseBalance(lease, confirmedPayments, today);

    expect(result.periodsDue).toBe(1);
    expect(result.rentDueToDate).toBe(100000);
    expect(result.paidToDate).toBe(300000);
    expect(result.outstanding).toBe(0);
    expect(result.credit).toBe(200000);
    expect(result.nextDueDate).not.toBeNull();
    // Month 4 starts on 2026-04-01
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2026-04-01");
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

    it("overdue returns Overdue · N periods and since DD/MM/YYYY", () => {
      const result = formatTwoLineRentDue({
        leaseStatus: "active",
        nextDueDate: "2026-06-29",
        unpaidPeriods: 5,
        todayInput: today,
      });
      expect(result.status).toBe("overdue");
      expect(result.line1).toBe("Overdue · 5 periods");
      expect(result.line2).toBe("since 29/06/2026");

      const singleResult = formatTwoLineRentDue({
        leaseStatus: "active",
        nextDueDate: "2026-10-20",
        unpaidPeriods: 1,
        todayInput: today,
      });
      expect(singleResult.line1).toBe("Overdue · 1 period");
      expect(singleResult.line2).toBe("since 20/10/2026");
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
});
