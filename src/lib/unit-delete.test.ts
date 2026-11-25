import { describe, it, expect } from "vitest";
import { canDeleteUnit, getUnitDeleteErrorMessage } from "./unit-delete";

describe("canDeleteUnit", () => {
  const now = new Date("2026-11-25T12:00:00Z");

  it("allows deleting a unit with no leases", () => {
    const result = canDeleteUnit([], now);
    expect(result.ok).toBe(true);
  });

  it("blocks deleting a unit with an active fixed-term lease (occupied)", () => {
    const result = canDeleteUnit(
      [
        {
          startDate: "2026-01-01T00:00:00Z",
          endDate: "2026-12-31T23:59:59Z",
          status: "active",
          terminatedAt: null,
          tenant: { fullName: "Amina Okonkwo" },
        },
      ],
      now
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("occupied");
      expect(result.tenantName).toBe("Amina Okonkwo");
      expect(getUnitDeleteErrorMessage("Flat 2", result)).toBe(
        "Amina Okonkwo is still living in Flat 2. Mark them as moved out first."
      );
    }
  });

  it("blocks deleting a unit with an active open-ended lease (endDate: null)", () => {
    const result = canDeleteUnit(
      [
        {
          startDate: "2025-06-01T00:00:00Z",
          endDate: null,
          status: "active",
          terminatedAt: null,
          tenant: { fullName: "Chidi Eze" },
        },
      ],
      now
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("occupied");
      expect(result.tenantName).toBe("Chidi Eze");
      expect(getUnitDeleteErrorMessage("Unit 4B", result)).toBe(
        "Chidi Eze is still living in Unit 4B. Mark them as moved out first."
      );
    }
  });

  it("allows deleting a unit when lease has ended (endDate < now)", () => {
    const result = canDeleteUnit(
      [
        {
          startDate: "2025-01-01T00:00:00Z",
          endDate: "2026-01-01T00:00:00Z",
          status: "active",
          terminatedAt: null,
          tenant: { fullName: "Old Tenant" },
        },
      ],
      now
    );
    expect(result.ok).toBe(true);
  });

  it("allows deleting a unit when tenant was marked as moved out (terminatedAt is set)", () => {
    const result = canDeleteUnit(
      [
        {
          startDate: "2026-01-01T00:00:00Z",
          endDate: "2026-12-31T23:59:59Z",
          status: "active",
          terminatedAt: "2026-10-01T00:00:00Z",
          tenant: { fullName: "Moved Out Tenant" },
        },
      ],
      now
    );
    expect(result.ok).toBe(true);
  });

  it("allows deleting a unit with declined or cancelled leases", () => {
    const result = canDeleteUnit(
      [
        {
          startDate: "2026-01-01T00:00:00Z",
          endDate: "2026-12-31T23:59:59Z",
          status: "declined",
          terminatedAt: null,
          tenant: { fullName: "Declined Tenant" },
        },
        {
          startDate: "2026-01-01T00:00:00Z",
          endDate: "2026-12-31T23:59:59Z",
          status: "cancelled",
          terminatedAt: null,
          tenant: { fullName: "Cancelled Tenant" },
        },
      ],
      now
    );
    expect(result.ok).toBe(true);
  });

  it("blocks deleting a unit with a pending in-app invitation (reserved)", () => {
    const result = canDeleteUnit(
      [
        {
          startDate: "2026-12-01T00:00:00Z",
          endDate: "2027-11-30T00:00:00Z",
          status: "pending",
          terminatedAt: null,
          invitationExpiresAt: "2026-12-05T00:00:00Z",
          tenant: { fullName: "Future Tenant" },
        },
      ],
      now
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("reserved");
      expect(result.tenantName).toBe("Future Tenant");
      expect(getUnitDeleteErrorMessage("Shop 3", result)).toBe(
        "Shop 3 has a pending invite for Future Tenant. Cancel the invite first."
      );
    }
  });

  it("blocks deleting a unit with an unredeemed invite code on an unended lease (reserved)", () => {
    const result = canDeleteUnit(
      [
        {
          startDate: "2026-11-01T00:00:00Z",
          endDate: "2027-10-31T00:00:00Z",
          status: "pending",
          terminatedAt: null,
          inviteCodes: [
            {
              code: "PROP-999",
              redeemedAt: null,
              expiresAt: "2026-12-01T00:00:00Z",
            },
          ],
          tenant: { fullName: "Invited Tenant" },
        },
      ],
      now
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("reserved");
      expect(result.tenantName).toBe("Invited Tenant");
    }
  });

  it("allows deleting a unit with expired invite on an ended lease", () => {
    const result = canDeleteUnit(
      [
        {
          startDate: "2025-01-01T00:00:00Z",
          endDate: "2025-12-31T00:00:00Z",
          status: "pending",
          terminatedAt: null,
          invitationExpiresAt: "2025-01-10T00:00:00Z",
          inviteCodes: [
            {
              code: "PROP-OLD",
              redeemedAt: null,
              expiresAt: "2025-01-10T00:00:00Z",
            },
          ],
          tenant: { fullName: "Expired Invite" },
        },
      ],
      now
    );
    expect(result.ok).toBe(true);
  });

  it("prioritizes occupied over reserved if multiple leases exist", () => {
    const result = canDeleteUnit(
      [
        {
          startDate: "2026-01-01T00:00:00Z",
          endDate: "2026-12-31T23:59:59Z",
          status: "active",
          terminatedAt: null,
          tenant: { fullName: "Living Tenant" },
        },
        {
          startDate: "2027-01-01T00:00:00Z",
          endDate: "2027-12-31T23:59:59Z",
          status: "pending",
          terminatedAt: null,
          invitationExpiresAt: "2026-12-01T00:00:00Z",
          tenant: { fullName: "Reserved Tenant" },
        },
      ],
      now
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("occupied");
      expect(result.tenantName).toBe("Living Tenant");
    }
  });
});

