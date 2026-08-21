import {
  NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE,
} from "@/lib/sync/native-account-markers.mjs";

/**
 * Small, privacy-safe auth diagnostics for UI surfaces and callback redirects.
 * Raw provider messages can contain implementation details, so the app maps
 * known Supabase error codes to a bounded reason and never puts them in URLs.
 */

export const AUTH_FAILURE_REASONS = [
  "expired",
  "browser_mismatch",
  "invalid",
  "provider",
  "configuration",
  "unknown",
] as const;

export type AuthFailureReason = (typeof AUTH_FAILURE_REASONS)[number];

interface ErrorShape {
  code?: unknown;
  message?: unknown;
  status?: unknown;
}

function errorShape(error: unknown): ErrorShape {
  return error && typeof error === "object" ? (error as ErrorShape) : {};
}

function errorCode(error: unknown): string {
  const code = errorShape(error).code;
  return typeof code === "string" ? code.toLowerCase() : "";
}

function errorMessage(error: unknown): string {
  const message = errorShape(error).message;
  return typeof message === "string" ? message.toLowerCase() : "";
}

export function parseAuthFailureReason(
  value: string | null | undefined,
): AuthFailureReason | null {
  return AUTH_FAILURE_REASONS.includes(value as AuthFailureReason)
    ? (value as AuthFailureReason)
    : value === "signin"
      ? "unknown"
      : null;
}

/** Map provider/callback errors to the only reasons that may enter a URL. */
export function authFailureReason(
  error: unknown,
  providerCode?: string | null,
): AuthFailureReason {
  const code = (providerCode ?? errorCode(error)).toLowerCase();
  if (code === "otp_expired" || code === "flow_state_expired") {
    return "expired";
  }
  if (code === "bad_code_verifier" || code === "flow_state_not_found") {
    return "browser_mismatch";
  }
  if (
    code === "bad_oauth_callback" ||
    code === "bad_oauth_state" ||
    code === "oauth_provider_not_supported" ||
    code === "provider_disabled"
  ) {
    return "provider";
  }
  if (
    code === "validation_failed" ||
    code === "bad_json" ||
    code === "invalid_credentials"
  ) {
    return "invalid";
  }
  return "unknown";
}

export function authFailureMessage(reason: AuthFailureReason): string {
  switch (reason) {
    case "expired":
      return "That sign-in link has expired or was already used. Request a fresh link below.";
    case "browser_mismatch":
      return "That link could not finish in this browser. Request a fresh link and open it in the same browser where you started, or use Apple or Google.";
    case "invalid":
      return "That sign-in link is incomplete or invalid. Request a fresh link below.";
    case "provider":
      return "The sign-in provider could not finish the request. Please try again or use another method.";
    case "configuration":
      return "Account sign-in is not configured on this deployment. Your journey is still safe on this device.";
    case "unknown":
      return "We couldn’t finish that sign-in. Request a fresh link or try Apple or Google instead.";
  }
}

/**
 * Marks a failure that happened AFTER the server accepted and consumed the
 * one-time code — the install/verification phase on this device.
 *
 * These used to be codeless Errors, so they fell through to the default
 * "check it carefully or request a new one". That advice cannot work: the
 * code was correct and is already spent, so requesting another just repeats
 * the same wall. The shared code lets the message tell the truth instead.
 */
export const EMAIL_OTP_POST_VERIFICATION_CODE = "email_otp_installation_failed";

export interface AuthRequestFailure {
  message: string;
  reference: string;
  /** True when local/offline continuation is a safe fallback. */
  unavailable: boolean;
}

/** Keep online browser blockers separate so the UI gives the right next step. */
function onlineAuthRequestFailure(
  error: unknown,
  retryAction: "try again" | "enter the code again",
): AuthRequestFailure | null {
  const code = errorCode(error);
  const message = errorMessage(error);

  // A bounded lock wait means another tab still owns the account operation.
  if (code === "web_auth_lock_unavailable") {
    return {
      message: `Another BibleQuest tab is busy. Finish there or close it, then ${retryAction}.`,
      reference: "AUTH-TAB-BUSY",
      unavailable: true,
    };
  }

  // A typed worker failure needs a refresh, not generic network advice.
  if (code === "web_auth_service_worker_unavailable") {
    return {
      message: `BibleQuest’s sign-in helper did not become ready. Close and reopen BibleQuest, then ${retryAction}.`,
      reference: "AUTH-SERVICE-WORKER-UNAVAILABLE",
      unavailable: true,
    };
  }

  // A deadline is retryable and distinct from a request that could not connect.
  if (code === "request_timeout") {
    return {
      message: `The sign-in request took too long. Please ${retryAction}.`,
      reference: "AUTH-REQUEST-TIMEOUT",
      unavailable: true,
    };
  }

  // An online fetch failure stays neutral because several local causes can block it.
  if (message.includes("failed to fetch")) {
    return {
      message: `The sign-in request could not connect while this device was online. Close and reopen BibleQuest, then ${retryAction}.`,
      reference: "AUTH-REQUEST-FETCH-FAILED",
      unavailable: true,
    };
  }

  return null;
}

/** Actionable messages for passwordless-email request failures. */
export function emailRequestFailure(
  error: unknown,
  online = true,
): AuthRequestFailure {
  const code = errorCode(error);
  const status = errorShape(error).status;

  if (code === NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE) {
    return {
      message:
        "Account sign-in is temporarily unavailable. Your journey remains safe on this device.",
      reference: "AUTH-BETA-UNAVAILABLE",
      unavailable: true,
    };
  }
  if (!online) {
    return {
      message:
        "You appear to be offline. Reconnect to request a sign-in email, or continue on this device.",
      reference: "AUTH-NETWORK",
      unavailable: true,
    };
  }
  // Online browser blockers carry typed references for support and recovery.
  const onlineFailure = onlineAuthRequestFailure(error, "try again");
  if (onlineFailure) {
    return onlineFailure;
  }
  if (code === "email_address_not_authorized") {
    return {
      message:
        "Email delivery is not enabled for this address yet. Use Apple or Google for now, or ask the BibleQuest team to finish production email setup.",
      reference: "AUTH-EMAIL-SETUP",
      unavailable: false,
    };
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    status === 429
  ) {
    return {
      message:
        "Too many emails were requested. Wait at least one minute, then try again.",
      reference: "AUTH-RATE-LIMIT",
      unavailable: false,
    };
  }
  if (code === "email_address_invalid") {
    return {
      message: "That email address doesn’t look valid. Check it and try again.",
      reference: "AUTH-EMAIL-INVALID",
      unavailable: false,
    };
  }
  if (
    code === "email_provider_disabled" ||
    code === "otp_disabled" ||
    code === "signup_disabled"
  ) {
    return {
      message:
        "Email sign-in is temporarily unavailable. Use Apple, Google, or continue on this device.",
      reference: "AUTH-EMAIL-DISABLED",
      unavailable: true,
    };
  }
  return {
    message:
      "We couldn’t request the email. Check your connection, wait a moment, and try again.",
    reference: "AUTH-EMAIL-REQUEST",
    unavailable: !online,
  };
}

/** Maps a user-entered email OTP failure without exposing provider details. */
export function emailOtpFailure(
  error: unknown,
  online = true,
): AuthRequestFailure {
  const code = errorCode(error);
  const status = errorShape(error).status;

  if (code === NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE) {
    return {
      message:
        "Account sign-in is temporarily unavailable. Keep this screen open and try again later.",
      reference: "AUTH-BETA-UNAVAILABLE",
      unavailable: true,
    };
  }
  if (!online) {
    return {
      message:
        "You appear to be offline. Reconnect, then enter the code again.",
      reference: "AUTH-NETWORK",
      unavailable: true,
    };
  }
  // Online browser blockers carry typed references for support and recovery.
  const onlineFailure = onlineAuthRequestFailure(error, "enter the code again");
  if (onlineFailure) {
    return onlineFailure;
  }
  if (
    code === "otp_expired" ||
    code === "token_expired" ||
    code === "invalid_otp" ||
    code === "validation_failed"
  ) {
    return {
      message:
        "That code is invalid or has expired. Check the email or request a new code.",
      reference: "AUTH-CODE-INVALID",
      unavailable: false,
    };
  }
  if (code === "over_request_rate_limit" || status === 429) {
    return {
      message: "Too many attempts. Wait a minute, then request a new code.",
      reference: "AUTH-RATE-LIMIT",
      unavailable: false,
    };
  }
  if (code === EMAIL_OTP_POST_VERIFICATION_CODE) {
    return {
      message:
        "Your code was correct — BibleQuest couldn’t finish opening your account on this device. Try again in a moment; a new code won’t help.",
      reference: "AUTH-INSTALL-INCOMPLETE",
      unavailable: true,
    };
  }
  return {
    message:
      "We couldn’t verify that code. Check it carefully or request a new one.",
    reference: "AUTH-CODE-VERIFY",
    unavailable: false,
  };
}

export function oauthRequestFailure(
  error: unknown,
  provider: "apple" | "google",
  online = true,
): AuthRequestFailure {
  const code = errorCode(error);
  const providerName = provider === "apple" ? "Apple" : "Google";
  const providerReference = provider === "apple" ? "APPLE" : "GOOGLE";
  if (!online) {
    return {
      message:
        "You appear to be offline. Reconnect to sign in, or continue on this device.",
      reference: "AUTH-NETWORK",
      unavailable: true,
    };
  }
  // Online browser blockers carry typed references for support and recovery.
  const onlineFailure = onlineAuthRequestFailure(error, "try again");
  if (onlineFailure) {
    return onlineFailure;
  }
  if (code === "provider_disabled" || code === "oauth_provider_not_supported") {
    return {
      message: `${providerName} sign-in is temporarily unavailable. Try another method or continue on this device.`,
      reference: `AUTH-${providerReference}-DISABLED`,
      unavailable: true,
    };
  }
  return {
    message: `We couldn’t open ${providerName} sign-in. Please try again.`,
    reference: `AUTH-${providerReference}-REQUEST`,
    unavailable: false,
  };
}
