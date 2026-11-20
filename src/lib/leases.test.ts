import { describe, it, expect } from "vitest";
import { getCurrentLease, getNextLease, getUnitStatus } from "./leases";

describe("getCurrentLease and getNextLease", () => {
  const today = new Date("2026-11-20T12:00:00Z"); // 2026-11-20 in Lagos

  it("handles running lease: returns the running lease and null nextLease when no renewal exists", () => {
    const leases = [
      {
        id: "lease-1",
        startDate: "2026-01-08",
        endDate: "2027-05-04",
        terminatedAt: null,
      },
    ];

    const current = getCurrentLease(leases, today);
    expect(current).not.toBeNull();
    expect(current?.id).toBe("lease-1");

    const next = getNextLease(leases, today);
    expect(next).toBeNull();

    expect(getUnitStatus(leases, today)).toBe("occupied");
  });

  it("handles upcoming only: returns earliest upcoming lease and the following one as nextLease", () => {
    const leases = [
      {
        id: "lease-upcoming-2",
        startDate: "2028-01-01",
        endDate: "2028-12-31",
        terminatedAt: null,
      },
      {
        id: "lease-upcoming-1",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
        terminatedAt: null,
      },
    ];

    const current = getCurrentLease(leases, today);
    expect(current).not.toBeNull();
    expect(current?.id).toBe("lease-upcoming-1");

    const next = getNextLease(leases, today);
    expect(next).not.toBeNull();
    expect(next?.id).toBe("lease-upcoming-2");

    expect(getUnitStatus(leases, today)).toBe("reserved");
  });

  it("handles past only: returns most recent past lease and null nextLease", () => {
    const leases = [
      {
        id: "lease-past-1",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        terminatedAt: null,
      },
      {
        id: "lease-past-2",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        terminatedAt: null,
      },
    ];

    const current = getCurrentLease(leases, today);
    expect(current).not.toBeNull();
    expect(current?.id).toBe("lease-past-2");

    const next = getNextLease(leases, today);
    expect(next).toBeNull();

    expect(getUnitStatus(leases, today)).toBe("vacant");
  });

  it("handles current + renewal (Ha-Shem 2 scenario): returns running lease as current and renewal as nextLease", () => {
    // Leases ordered startDate desc (as returned by database)
    const leases = [
      {
        id: "lease-renewal",
        startDate: "2027-05-05",
        endDate: "2028-05-05",
        terminatedAt: null,
      },
      {
        id: "lease-current",
        startDate: "2026-01-08",
        endDate: "2027-05-04",
        terminatedAt: null,
      },
    ];

    const current = getCurrentLease(leases, today);
    expect(current).not.toBeNull();
    expect(current?.id).toBe("lease-current");

    const next = getNextLease(leases, today);
    expect(next).not.toBeNull();
    expect(next?.id).toBe("lease-renewal");

    expect(getUnitStatus(leases, today)).toBe("occupied");
  });

  it("excludes the lease being viewed: when viewing the upcoming renewal lease itself, returns null", () => {
    const leases = [
      {
        id: "lease-current",
        startDate: "2026-01-08",
        endDate: "2027-05-04",
        terminatedAt: null,
      },
      {
        id: "lease-renewal",
        startDate: "2027-05-05",
        endDate: "2028-05-05",
        terminatedAt: null,
      },
    ];

    // When viewing the renewal lease itself:
    const renewalLease = leases[1];
    const nextWhenViewingRenewal = getNextLease(leases, today, renewalLease);
    expect(nextWhenViewingRenewal).toBeNull();

    // Passing reference lease as 2nd argument also works
    expect(getNextLease(leases, renewalLease)).toBeNull();

    // When viewing current lease: returns renewal
    const currentLease = leases[0];
    const nextWhenViewingCurrent = getNextLease(leases, today, currentLease);
    expect(nextWhenViewingCurrent?.id).toBe("lease-renewal");
  });

  it("ignores terminated leases", () => {
    const leases = [
      {
        id: "lease-terminated-running",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        terminatedAt: "2026-06-01T00:00:00Z",
      },
      {
        id: "lease-upcoming",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
        terminatedAt: null,
      },
    ];

    const current = getCurrentLease(leases, today);
    expect(current?.id).toBe("lease-upcoming");
    expect(getUnitStatus(leases, today)).toBe("reserved");
  });

  it("returns null and vacant when empty", () => {
    expect(getCurrentLease([])).toBeNull();
    expect(getNextLease([])).toBeNull();
    expect(getUnitStatus([])).toBe("vacant");
  });

  it("ignores pending, declined, cancelled, and expired leases in getCurrentLease", () => {
    const leases = [
      {
        id: "lease-pending",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "pending",
        terminatedAt: null,
      },
      {
        id: "lease-declined",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "declined",
        terminatedAt: null,
      },
      {
        id: "lease-cancelled",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "cancelled",
        terminatedAt: null,
      },
    ];

    expect(getCurrentLease(leases, today)).toBeNull();
    expect(getNextLease(leases, today)).toBeNull();
  });

  it("marks unit reserved when an unexpired pending invitation exists, vacant if expired", () => {
    const unexpiredPending = [
      {
        id: "lease-pending-1",
        startDate: "2026-12-01",
        endDate: "2027-12-01",
        status: "pending",
        invitationExpiresAt: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
        terminatedAt: null,
      },
    ];
    expect(getUnitStatus(unexpiredPending, today)).toBe("reserved");

    const expiredPending = [
      {
        id: "lease-pending-2",
        startDate: "2026-12-01",
        endDate: "2027-12-01",
        status: "pending",
        invitationExpiresAt: new Date(today.getTime() - 24 * 60 * 60 * 1000), // 1 day in past
        terminatedAt: null,
      },
    ];
    expect(getUnitStatus(expiredPending, today)).toBe("vacant");
  });
});
