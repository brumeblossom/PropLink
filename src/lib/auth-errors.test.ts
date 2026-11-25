import { describe, it, expect } from "vitest";
import { getSanitizedAuthError } from "./auth-errors";

describe("Signup Error Sanitization", () => {
  it("sanitizes Prisma P2002 error on email target", () => {
    const error = {
      code: "P2002",
      meta: { target: ["email"] },
      message: "Unique constraint failed on the fields: (`email`)",
    };
    expect(getSanitizedAuthError(error)).toBe(
      "An account with this email already exists. Log in instead."
    );
  });

  it("sanitizes Supabase user already registered error", () => {
    const error = {
      message: "User already registered",
    };
    expect(getSanitizedAuthError(error)).toBe(
      "An account with this email already exists. Log in instead."
    );
  });

  it("never exposes raw stack traces or internal DB errors", () => {
    const error = {
      code: "P2003",
      message: "Foreign key constraint failed on the field: `users_pkey` at PostgreSQL adapter line 45",
    };
    expect(getSanitizedAuthError(error)).toBe(
      "An unexpected error occurred. Please try again."
    );
  });
});
