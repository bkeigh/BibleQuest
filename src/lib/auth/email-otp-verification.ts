"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { DeadlineError, withDeadline } from "@/lib/async/deadline";
import {
  AccountLifecycleBusyError,
  beginAccountLifecycle,
  finishAccountLifecycle,
  requireAccountLifecycleIdle,
} from "./account-lifecycle";
import {
  createClient,
  createEmailAuthRequestClient,
  createEmailOtpVerificationClient,
} from "@/lib/supabase/client";
import {
  clearExactAuthSession,
  type ExactCredentialClearResult,
  type ExactNativeAuthSession,
} from "./exact-session";
import { isNativeTarget } from "@/lib/platform/target";
import { EMAIL_OTP_POST_VERIFICATION_CODE } from "./errors";
import {
  WebAuthUnavailableError,
  installVerifiedWebSession,
  readWebAuthState,
  requireCurrentWebAccountRealm,
  withWebAccountOperationLock,
  type WebAccountOperationHandle,
  type WebSessionInstallResult,
} from "@/lib/supabase/web-auth-storage";

const EMAIL_OTP_VERIFICATION_DEADLINE_MS = 12_000;
const EMAIL_OTP_INSTALLATION_DEADLINE_MS = 12_000;
const MAX_EMAIL_LENGTH = 320;

type OtpVerificationClient = {
  auth: Pick<SupabaseClient["auth"], "verifyOtp">;
};

type OtpRequestClient = {
  auth: Pick<SupabaseClient["auth"], "signInWithOtp">;
};

type SessionInstallationClient = {
  auth: Pick<SupabaseClient["auth"], "setSession"> &
    Partial<Pick<SupabaseClient["auth"], "getSession">>;
};

export interface EmailOtpAttempt {
  readonly email: string;
  readonly generation: number;
  readonly lifecycleRevision: number;
}

export type EmailOtpAttemptResult =
  | { status: "installed" }
  | { status: "stale" }
  | { status: "error"; error: unknown };

interface EmailOtpAttemptOptions {
  clearInstalledSession?: (
    expected: ExactNativeAuthSession,
  ) => Promise<ExactCredentialClearResult>;
  installationTimeoutMs?: number;
  installationClient?: SessionInstallationClient;
  installWebSession?: (
    handle: WebAccountOperationHandle,
    session: Session,
  ) => Promise<WebSessionInstallResult>;
  timeoutMs?: number;
  verificationClient?: OtpVerificationClient;
}

type SessionInstallationResult = Awaited<
  ReturnType<SupabaseClient["auth"]["setSession"]>
>;

interface InstallationResolution {
  result: EmailOtpAttemptResult;
  safeToRelease: boolean;
}

let authAttemptGeneration = 0;

/** Requests one code off-storage after the web realm and empty slot are proved. */
export function requestIsolatedEmailOtp(
  email: string,
  shouldCreateUser: boolean,
  requestClient?: OtpRequestClient,
): ReturnType<SupabaseClient["auth"]["signInWithOtp"]> {
  const request = () =>
    (requestClient ?? createEmailAuthRequestClient()).auth.signInWithOtp({
      email,
      options: { shouldCreateUser },
    });
  if (isNativeTarget()) return request();
  return withWebAccountOperationLock(async (handle) => {
    await requireCurrentWebAccountRealm(handle);
    const state = await readWebAuthState(handle);
    if (state.status !== "missing") throw new WebAuthUnavailableError();
    return request();
  });
}

/** Requires a fresh document when an ambiguous install cannot be reconciled. */
/**
 * A failure after the server already consumed the code. Carries the shared
 * code so the message can say so instead of blaming the code the person typed.
 */
export class EmailOtpInstallationError extends Error {
  readonly code = EMAIL_OTP_POST_VERIFICATION_CODE;

  constructor(message: string) {
    super(message);
    this.name = "EmailOtpInstallationError";
  }
}

export class EmailOtpInstallationRecoveryError extends Error {
  readonly code = "email_otp_installation_recovery_required";
  readonly reloadRequired = true;

  constructor() {
    super("Email-code session installation needs a safe reload.");
    this.name = "EmailOtpInstallationRecoveryError";
  }
}

/** Recognizes the content-free recovery signal across lazy-loaded bundles. */
export function emailOtpInstallationNeedsReload(error: unknown): boolean {
  return (
    error instanceof EmailOtpInstallationRecoveryError ||
    (Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code ===
        "email_otp_installation_recovery_required")
  );
}

/** Compare addresses without making provider casing differences a new identity. */
function canonicalEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Capture both the current auth attempt and the idle account lifecycle. */
export function beginEmailOtpAttempt(email: string): EmailOtpAttempt {
  const expectedEmail = canonicalEmail(email);
  if (!expectedEmail || expectedEmail.length > MAX_EMAIL_LENGTH) {
    throw new Error("Email-code verification has no valid address.");
  }
  const lifecycleRevision = requireAccountLifecycleIdle();
  authAttemptGeneration += 1;
  return {
    email: expectedEmail,
    generation: authAttemptGeneration,
    lifecycleRevision,
  };
}

/** Invalidate only the attempt still owning the global installation boundary. */
export function cancelEmailOtpAttempt(attempt: EmailOtpAttempt | null): void {
  if (attempt?.generation === authAttemptGeneration) {
    authAttemptGeneration += 1;
  }
}

/** Check generation and UI address before a verification may install a session. */
export function emailOtpAttemptIsCurrent(
  attempt: EmailOtpAttempt,
  currentEmail: string,
): boolean {
  return (
    attempt.generation === authAttemptGeneration &&
    canonicalEmail(currentEmail) === attempt.email
  );
}

/** Return only a complete session issued for the exact requested email. */
function verifiedAttemptSession(
  attempt: EmailOtpAttempt,
  data: Awaited<ReturnType<SupabaseClient["auth"]["verifyOtp"]>>["data"],
) {
  const session = data.session;
  const user = data.user;
  if (
    !session ||
    !user ||
    !session.access_token ||
    !session.refresh_token ||
    !session.user?.id ||
    session.user.id !== user.id ||
    canonicalEmail(user.email ?? "") !== attempt.email ||
    canonicalEmail(session.user.email ?? "") !== attempt.email
  ) {
    throw new EmailOtpInstallationError(
      "Email-code verification returned an invalid session.",
    );
  }
  return session;
}

/** Prefer the actual installed tokens when setSession refreshed them. */
function installedCredential(
  installed: SessionInstallationResult,
  fallback: ExactNativeAuthSession,
): ExactNativeAuthSession {
  const session = installed.data.session;
  if (
    session?.user.id === fallback.userId &&
    session.access_token &&
    session.refresh_token
  ) {
    return {
      userId: fallback.userId,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
  }
  return fallback;
}

/** Treat only a proved absence or different credential as safe reconciliation. */
export function credentialClearProvesReconciliation(
  result: ExactCredentialClearResult,
): boolean {
  return (
    result === "cleared" ||
    result === "different-session" ||
    result === "missing"
  );
}

/** Compare-and-remove a stale install without touching a newer native session. */
async function clearInstalledCredential(
  expected: ExactNativeAuthSession,
  clear: (value: ExactNativeAuthSession) => Promise<ExactCredentialClearResult>,
): Promise<boolean> {
  try {
    return credentialClearProvesReconciliation(await clear(expected));
  } catch {
    return false;
  }
}

/** Validate the singleton response before the UI may accept the installed user. */
function installationMatchesAttempt(
  attempt: EmailOtpAttempt,
  expectedUserId: string,
  installed: SessionInstallationResult,
): boolean {
  return (
    !installed.error &&
    installed.data.user?.id === expectedUserId &&
    installed.data.session?.user.id === expectedUserId &&
    canonicalEmail(installed.data.user.email ?? "") === attempt.email &&
    canonicalEmail(installed.data.session.user.email ?? "") === attempt.email
  );
}

/**
 * Verify off-storage, then install exactly one still-current result while the
 * lifecycle and web cross-tab lock prevent another account mutation overtaking it.
 */
export async function verifyAndInstallEmailOtp(
  attempt: EmailOtpAttempt,
  token: string,
  currentEmail: () => string,
  options: EmailOtpAttemptOptions = {},
): Promise<EmailOtpAttemptResult> {
  // Consume a web code only after this v28 realm and every live peer attest.
  if (!isNativeTarget()) {
    await withWebAccountOperationLock((handle) =>
      requireCurrentWebAccountRealm(handle),
    );
  }
  const verificationClient =
    options.verificationClient ?? createEmailOtpVerificationClient();
  const verification = await withDeadline(
    verificationClient.auth.verifyOtp({
      email: attempt.email,
      token,
      type: "email",
    }),
    options.timeoutMs ?? EMAIL_OTP_VERIFICATION_DEADLINE_MS,
    "Email-code verification",
  );
  if (verification.error) {
    return { status: "error", error: verification.error };
  }
  if (!emailOtpAttemptIsCurrent(attempt, currentEmail())) {
    return { status: "stale" };
  }

  const session = verifiedAttemptSession(attempt, verification.data);
  requireAccountLifecycleIdle(attempt.lifecycleRevision);
  const lifecycle = beginAccountLifecycle(session.user.id);
  if (!lifecycle) throw new AccountLifecycleBusyError();

  let releaseLifecycle = true;
  try {
    if (!emailOtpAttemptIsCurrent(attempt, currentEmail())) {
      return { status: "stale" };
    }
    const fallbackCredential: ExactNativeAuthSession = {
      userId: session.user.id,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
    let callerTimedOut = false;

    /** Owns account ordering until a late write is accepted or removed. */
    const installAndReconcile = async (
      webOperation?: WebAccountOperationHandle,
    ): Promise<InstallationResolution> => {
      const clearInstalledSession =
        options.clearInstalledSession ??
        ((value: ExactNativeAuthSession) =>
          clearExactAuthSession(value, webOperation));
      if (
        callerTimedOut ||
        !emailOtpAttemptIsCurrent(attempt, currentEmail())
      ) {
        return { result: { status: "stale" }, safeToRelease: true };
      }

      if (!isNativeTarget()) {
        if (!webOperation) {
          return {
            result: {
              status: "error",
              error: new EmailOtpInstallationError("Account unavailable."),
            },
            safeToRelease: true,
          };
        }
        const installWebSession =
          options.installWebSession ??
          ((handle: WebAccountOperationHandle) =>
            installVerifiedWebSession(handle, session, "email-otp"));
        const installed = await installWebSession(webOperation, session);
        const attemptStillCurrent = emailOtpAttemptIsCurrent(
          attempt,
          currentEmail(),
        );
        if (
          installed === "installed" &&
          attemptStillCurrent &&
          !callerTimedOut
        ) {
          return { result: { status: "installed" }, safeToRelease: true };
        }
        // A durable provisional install owns crash recovery and must never be
        // compare-cleared after the one-time OTP has already been consumed.
        if (installed === "recovery-required") {
          return {
            result: {
              status: "error",
              error: new EmailOtpInstallationRecoveryError(),
            },
            safeToRelease: true,
          };
        }
        if (installed === "occupied") {
          return { result: { status: "stale" }, safeToRelease: true };
        }
        if (installed === "installed" || installed === "unavailable") {
          const safeToRelease = await clearInstalledCredential(
            fallbackCredential,
            clearInstalledSession,
          );
          return {
            result:
              !attemptStillCurrent || callerTimedOut
                ? { status: "stale" }
                : {
                    status: "error",
                    error: new EmailOtpInstallationError(
                      "Email-code installation unavailable.",
                    ),
                  },
            safeToRelease,
          };
        }
        return {
          result: {
            status: "error",
            error: new EmailOtpInstallationError("Email-code session was rejected."),
          },
          safeToRelease: true,
        };
      }

      const installationClient = options.installationClient ?? createClient();
      // Native may still hold another account that this OTP must never replace.
      if (installationClient.auth.getSession) {
        const current = await installationClient.auth.getSession();
        if (current.error) {
          return {
            result: { status: "error", error: current.error },
            safeToRelease: true,
          };
        }
        if (
          current.data.session &&
          current.data.session.user.id !== session.user.id
        ) {
          return { result: { status: "stale" }, safeToRelease: true };
        }
      }
      let installed: SessionInstallationResult;
      try {
        installed = await installationClient.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      } catch (error) {
        return {
          result: { status: "error", error },
          safeToRelease: await clearInstalledCredential(
            fallbackCredential,
            clearInstalledSession,
          ),
        };
      }

      if (installed.error) {
        return {
          result: { status: "error", error: installed.error },
          safeToRelease: await clearInstalledCredential(
            installedCredential(installed, fallbackCredential),
            clearInstalledSession,
          ),
        };
      }
      const responseMatches = installationMatchesAttempt(
        attempt,
        session.user.id,
        installed,
      );
      const attemptStillCurrent = emailOtpAttemptIsCurrent(
        attempt,
        currentEmail(),
      );
      if (responseMatches && attemptStillCurrent && !callerTimedOut) {
        return { result: { status: "installed" }, safeToRelease: true };
      }

      const safeToRelease = await clearInstalledCredential(
        installedCredential(installed, fallbackCredential),
        clearInstalledSession,
      );
      if (!attemptStillCurrent || callerTimedOut) {
        return { result: { status: "stale" }, safeToRelease };
      }
      return {
        result: {
          status: "error",
          error: new EmailOtpInstallationError(
            "Email-code session installation changed identity.",
          ),
        },
        safeToRelease,
      };
    };

    const installation = isNativeTarget()
      ? installAndReconcile()
      : withWebAccountOperationLock(installAndReconcile);

    let resolution: InstallationResolution;
    try {
      resolution = await withDeadline(
        installation,
        options.installationTimeoutMs ??
          EMAIL_OTP_INSTALLATION_DEADLINE_MS,
        "Email-code session installation",
      );
    } catch (error) {
      if (error instanceof DeadlineError) {
        // Keep the lock and lifecycle until the late write is removed exactly.
        callerTimedOut = true;
        releaseLifecycle = false;
        void installation.then(
          (late) => {
            if (late.safeToRelease) finishAccountLifecycle(lifecycle);
          },
          () => undefined,
        );
        throw new EmailOtpInstallationRecoveryError();
      }
      throw error;
    }

    if (!resolution.safeToRelease) {
      releaseLifecycle = false;
      throw new EmailOtpInstallationRecoveryError();
    }
    return resolution.result;
  } finally {
    if (releaseLifecycle) finishAccountLifecycle(lifecycle);
  }
}
