export const OPERATOR_PLUS_DURATIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "365d", label: "1 year" },
  { value: "lifetime", label: "Lifetime" },
] as const;

export type OperatorPlusDuration =
  (typeof OPERATOR_PLUS_DURATIONS)[number]["value"];

export interface OperatorPlusActionState {
  status: "idle" | "success" | "error";
  message: string;
  completedAt?: string;
}

export interface GrantOperatorPlusInput {
  email: string;
  confirmation: string;
  duration: OperatorPlusDuration;
  reason: string;
}

export interface RevokeOperatorPlusInput {
  email: string;
  confirmation: string;
  reason: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalizes an account address for exact-match support operations. */
export function normalizeConsoleAccountEmail(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().slice(0, 254)
    : "";
}

/** Accepts only the four database-enforced entitlement windows. */
export function isOperatorPlusDuration(
  value: unknown,
): value is OperatorPlusDuration {
  return OPERATOR_PLUS_DURATIONS.some((option) => option.value === value);
}

/** Reads and validates one high-impact grant form without trusting the client. */
export function grantOperatorPlusInput(
  formData: FormData,
): GrantOperatorPlusInput | null {
  const email = normalizeConsoleAccountEmail(formData.get("email"));
  const confirmation = normalizeConsoleAccountEmail(
    formData.get("confirmation"),
  );
  const duration = formData.get("duration");
  const reason =
    typeof formData.get("reason") === "string"
      ? String(formData.get("reason")).trim()
      : "";
  if (
    !EMAIL.test(email) ||
    confirmation !== email ||
    !isOperatorPlusDuration(duration) ||
    reason.length < 3 ||
    reason.length > 240 ||
    /[\u0000-\u001f\u007f]/.test(reason)
  ) {
    return null;
  }
  return { email, confirmation, duration, reason };
}

/** Reads and validates one manual-only revocation form. */
export function revokeOperatorPlusInput(
  formData: FormData,
): RevokeOperatorPlusInput | null {
  const email = normalizeConsoleAccountEmail(formData.get("email"));
  const confirmation = normalizeConsoleAccountEmail(
    formData.get("confirmation"),
  );
  const reason =
    typeof formData.get("reason") === "string"
      ? String(formData.get("reason")).trim()
      : "";
  if (
    !EMAIL.test(email) ||
    confirmation !== email ||
    reason.length < 3 ||
    reason.length > 240 ||
    /[\u0000-\u001f\u007f]/.test(reason)
  ) {
    return null;
  }
  return { email, confirmation, reason };
}
