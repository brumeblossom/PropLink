import { describe, it, expect } from "vitest";
import { isPasswordValid } from "@/lib/password";

describe("Password validation", () => {
  it("rejects passwords under 8 characters", () => {
    expect(isPasswordValid("Ab!xyz")).toBe(false);
  });

  it("rejects passwords without uppercase letters", () => {
    expect(isPasswordValid("password!123")).toBe(false);
  });

  it("rejects passwords without lowercase letters", () => {
    expect(isPasswordValid("PASSWORD!123")).toBe(false);
  });

  it("rejects passwords without special characters", () => {
    expect(isPasswordValid("Password123")).toBe(false);
  });

  it("accepts passwords that meet all 4 criteria", () => {
    expect(isPasswordValid("Password!1")).toBe(true);
    expect(isPasswordValid("P@ssw0rd2026")).toBe(true);
    expect(isPasswordValid("Abcdefg#")).toBe(true);
  });
});
