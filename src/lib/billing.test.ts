// src/lib/billing.test.ts
import { describe, it, expect } from "vitest";
import {
  getPeriodStarts,
  getRentPeriodForDate,
  getLeaseBalance,
  formatLagosYMD,
  PaymentLike,
} from "./billing";

describe("Billing & Running Balance", () => {
  it("Flat3 example: starts 29/07/2026, ₦800k monthly, ₦600k paid, checked on 19/11/2026", () => {
    const lease = {
      startDate: new Date("2026-07-29T00:00:00.000Z"),
      endDate: new Date("2027-07-28T00:00:00.000Z"),
      rentAmount: 800000,
      rentFrequency: "monthly",
    };
    const confirmedPayments = [{ amount: 600000, status: "confirmed" }];
    const today = new Date("2026-11-19T12:00:00.000Z");

    const result = getLeaseBalance(lease, confirmedPayments, today);

    expect(result.periodsDue).toBe(4); // July 29, Aug 29, Sep 29, Oct 29
    expect(result.rentDueToDate).toBe(3200000); // 4 * 800,000
    expect(result.paidToDate).toBe(600000);
    expect(result.outstanding).toBe(2600000);
    expect(result.credit).toBe(0);
    expect(result.nextDueDate).not.toBeNull();
    expect(formatLagosYMD(result.nextDueDate!)).toBe("2026-07-29");
  });

  it("Annual lease fully paid: ₦1.5m/yr, ₦1.5m paid → 0 outstanding, no next due date", () => {
    const lease = {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      rentAmount: 1500000,
      rentFrequency: "annually",
    };
    const confirmedPayments = [{ amount: 1500000, status: "confirmed" }];
    const today = new Date("2026-06-01T12:00:00.000Z");

    const result = getLeaseBalance(lease, confirmedPayments, today);

    expect(result.periodsDue).toBe(1);
    expect(result.rentDueToDate).toBe(1500000);
    expect(result.paidToDate).toBe(1500000);
    expect(result.outstanding).toBe(0);
    expect(result.credit).toBe(0);
    expect(result.nextDueDate).toBeNull(); // Paid to end of lease
  });

  it("Partial payment: ₦800k monthly, ₦400k paid in month 1 → ₦400k outstanding, next due date is current period", () => {
    const lease = {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
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
      endDate: new Date("2026-12-31T00:00:00.000Z"),
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
      endDate: new Date("2026-04-30T00:00:00.000Z"),
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
});
