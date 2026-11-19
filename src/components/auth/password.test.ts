import { describe, it, expect } from "vitest";
import { isPasswordValid } from "@/lib/password";

describe("Password validation", () => {
  it("rejects passwords under 8 characters", () => {
    expect(isPasswordValid("Ab1!xyz")).toBe(false);
  });

  it("rejects passwords without uppercase letters", () => {
    expect(isPasswordValid("password123")).toBe(false);
  });

  it("rejects passwords without lowercase letters", () => {
    expect(isPasswordValid("PASSWORD123")).toBe(false);
  });

  it("rejects passwords without numbers", () => {
    expect(isPasswordValid("PasswordOnly")).toBe(false);
  });

  it("accepts passwords that meet all 4 criteria", () => {
    expect(isPasswordValid("Password123")).toBe(true);
    expect(isPasswordValid("P@ssw0rd2026")).toBe(true);
    expect(isPasswordValid("Abcdefg8")).toBe(true);
  });
});
