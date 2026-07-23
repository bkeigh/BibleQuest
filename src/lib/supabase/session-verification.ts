/** Outcomes for a network-backed Supabase identity check. */
export type SessionVerificationDecision =
  | "accept"
  | "clear-local-auth"
  | "preserve-local-state";

/** Boundary applied as soon as a cached auth session is observed. */
export interface ObservedSessionBoundary {
  isolateUntilVerified: boolean;
  preserveVerifiedUserOnRetryableFailure: boolean;
}

interface AuthErrorShape {
  code?: unknown;
  name?: unknown;
  status?: unknown;
}

const TERMINAL_AUTH_CODES = new Set([
  "bad_jwt",
  "refresh_token_not_found",
  "session_not_found",
  "user_not_found",
]);

/** Cached auth events never prove that the account still exists remotely. */
export function authEventRequiresUserVerification(event: string): boolean {
  return event !== "SIGNED_OUT";
}

/** Prevents one account from remaining active while another account verifies. */
export function observedSessionBoundary(
  verifiedUserId: string | null,
  observedUserId: string,
): ObservedSessionBoundary {
  const sameVerifiedUser =
    verifiedUserId !== null && verifiedUserId === observedUserId;
  return {
    isolateUntilVerified: !sameVerifiedUser,
    preserveVerifiedUserOnRetryableFailure: sameVerifiedUser,
  };
}

/** Distinguishes deleted/invalid identities from retryable network failures. */
export function decideSessionVerification(
  userPresent: boolean,
  error: unknown,
): SessionVerificationDecision {
  if (userPresent) return "accept";
  if (!error) return "clear-local-auth";

  const shape =
    typeof error === "object" && error !== null
      ? (error as AuthErrorShape)
      : ({} as AuthErrorShape);
  const name =
    typeof shape.name === "string" ? shape.name.toLowerCase() : "";
  const code =
    typeof shape.code === "string" ? shape.code.toLowerCase() : "";
  const status = typeof shape.status === "number" ? shape.status : 0;

  if (
    name === "authsessionmissingerror" ||
    TERMINAL_AUTH_CODES.has(code) ||
    status === 400 ||
    status === 401 ||
    status === 403
  ) {
    return "clear-local-auth";
  }

  return "preserve-local-state";
}
