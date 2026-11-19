export function getSanitizedAuthError(
  err: unknown,
  defaultMessage = "An unexpected error occurred. Please try again."
): string {
  if (err && typeof err === "object") {
    const errorObj = err as {
      code?: string;
      message?: string;
      meta?: { target?: string[] | string };
    };

    const targetStr = Array.isArray(errorObj.meta?.target)
      ? errorObj.meta.target.join(",")
      : typeof errorObj.meta?.target === "string"
      ? errorObj.meta.target
      : "";
    const errStr = `${targetStr} ${errorObj.message || ""}`.toLowerCase();

    if (errorObj.code === "P2002" || errStr.includes("unique constraint")) {
      if (errStr.includes("phone")) {
        return "This phone number is already registered. Use a different number or leave it blank.";
      }
      if (errStr.includes("email")) {
        return "An account with this email already exists. Log in instead.";
      }
    }

    if (
      errStr.includes("already registered") ||
      errStr.includes("already exists") ||
      errStr.includes("already in use") ||
      errStr.includes("user already")
    ) {
      return "An account with this email already exists. Log in instead.";
    }
  }

  return defaultMessage;
}
