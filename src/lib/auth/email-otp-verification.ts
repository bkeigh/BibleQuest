"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DeadlineError, withDeadline } from "@/lib/async/deadline";
import {
  AccountLifecycleBusyError,
  beginAccountLifecycle,
  finishAccountLifecycle,
  requireAccountLifecycleIdle,
} from "./account-lifecycle";
import {
  createClient,
  createEmailOtpVerificationClient,
} from "@/lib/supabase/client";
import {
  clearExactNativeAuthSession,
  type ExactCredentialClearResult,
  type ExactNativeAuthSession,
} from "@/lib/supabase/native-auth-storage";

const EMAIL_OTP_VERIFICATION_DEADLINE_MS = 12_000;
const EMAIL_OTP_INSTALLATION_DEADLINE_MS = 12_000;
const MAX_EMAIL_LENGTH = 320;

type OtpVerificationClient = {
  auth: Pick<SupabaseClient["auth"], "verifyOtp">;
};

type SessionInstallationClient = {
  auth: Pick<SupabaseClient["auth"], "setSession">;
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
  timeoutMs?: number;
  verificationClient?: OtpVerificationClient;
}

type SessionInstallationResult = Awaited<
  ReturnType<SupabaseClient["auth"]["setSession"]>
>;

let authAttemptGeneration = 0;

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
    throw new Error("Email-code verification returned an invalid session.");
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
function exactClearIsSafe(result: ExactCredentialClearResult): boolean {
  return result !== "unavailable";
}

/** Compare-and-remove a stale install without touching a newer native session. */
async function clearInstalledCredential(
  expected: ExactNativeAuthSession,
  clear: (value: ExactNativeAuthSession) => Promise<ExactCredentialClearResult>,
): Promise<boolean> {
  try {
    return exactClearIsSafe(await clear(expected));
  } catch {
    return false;
  }
}

/** Reconcile a setSession promise that outlived its caller-visible deadline. */
async function reconcileLateInstallation(
  installation: Promise<SessionInstallationResult>,
  fallback: ExactNativeAuthSession,
  clear: (value: ExactNativeAuthSession) => Promise<ExactCredentialClearResult>,
): Promise<boolean> {
  try {
    const installed = await installation;
    return clearInstalledCredential(
      installedCredential(installed, fallback),
      clear,
    );
  } catch {
    return clearInstalledCredential(fallback, clear);
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
 * device-wide lifecycle prevents another account mutation from overtaking it.
 */
export async function verifyAndInstallEmailOtp(
  attempt: EmailOtpAttempt,
  token: string,
  currentEmail: () => string,
  options: EmailOtpAttemptOptions = {},
): Promise<EmailOtpAttemptResult> {
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
    const installationClient = options.installationClient ?? createClient();
    const fallbackCredential: ExactNativeAuthSession = {
      userId: session.user.id,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
    const clearInstalledSession =
      options.clearInstalledSession ?? clearExactNativeAuthSession;
    const installation = Promise.resolve().then(() =>
      installationClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    );

    let installed: SessionInstallationResult;
    try {
      installed = await withDeadline(
        installation,
        options.installationTimeoutMs ??
          EMAIL_OTP_INSTALLATION_DEADLINE_MS,
        "Email-code session installation",
      );
    } catch (error) {
      if (error instanceof DeadlineError) {
        // The UI may recover now, but the lifecycle remains closed until the
        // late write is either removed exactly or proved to be a newer session.
        releaseLifecycle = false;
        void reconcileLateInstallation(
          installation,
          fallbackCredential,
          clearInstalledSession,
        ).then((safe) => {
          if (safe) finishAccountLifecycle(lifecycle);
        });
        throw error;
      }
      const safe = await clearInstalledCredential(
        fallbackCredential,
        clearInstalledSession,
      );
      if (!safe) releaseLifecycle = false;
      throw error;
    }

    if (installed.error) {
      const safe = await clearInstalledCredential(
        installedCredential(installed, fallbackCredential),
        clearInstalledSession,
      );
      if (!safe) releaseLifecycle = false;
      return { status: "error", error: installed.error };
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
    if (!responseMatches || !attemptStillCurrent) {
      const safe = await clearInstalledCredential(
        installedCredential(installed, fallbackCredential),
        clearInstalledSession,
      );
      if (!safe) releaseLifecycle = false;
      if (!attemptStillCurrent) return { status: "stale" };
      return {
        status: "error",
        error: new Error("Email-code session installation changed identity."),
      };
    }
    return { status: "installed" };
  } finally {
    if (releaseLifecycle) finishAccountLifecycle(lifecycle);
  }
}
