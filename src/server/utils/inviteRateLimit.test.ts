import { describe, it, expect } from "vitest";
import { isRateLimited, INVITE_ATTEMPT_LIMIT } from "./inviteRateLimit";

describe("isRateLimited", () => {
  it("allows requests when attempt count is below the limit", () => {
    expect(isRateLimited(0)).toBe(false);
    expect(isRateLimited(1)).toBe(false);
    expect(isRateLimited(INVITE_ATTEMPT_LIMIT - 1)).toBe(false);
    expect(isRateLimited(9)).toBe(false);
  });

  it("denies requests when attempt count reaches or exceeds the limit of 10", () => {
    expect(isRateLimited(INVITE_ATTEMPT_LIMIT)).toBe(true);
    expect(isRateLimited(10)).toBe(true);
    expect(isRateLimited(11)).toBe(true);
    expect(isRateLimited(100)).toBe(true);
  });

  it("supports custom limit thresholds", () => {
    expect(isRateLimited(4, 5)).toBe(false);
    expect(isRateLimited(5, 5)).toBe(true);
    expect(isRateLimited(6, 5)).toBe(true);
  });
});
