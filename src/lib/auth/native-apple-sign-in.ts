"use client";

import { registerPlugin } from "@capacitor/core";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { DeadlineError, withDeadline } from "@/lib/async/deadline";
import {
  AccountLifecycleBusyError,
  beginAccountLifecycle,
  finishAccountLifecycle,
  requireAccountLifecycleIdle,
} from "@/lib/auth/account-lifecycle";
import {
  createAppleIdTokenAuthClient,
  createClient,
} from "@/lib/supabase/client";
import {
  clearExactAuthSession,
  type ExactCredentialClearResult,
  type ExactNativeAuthSession,
} from "@/lib/auth/exact-session";
import { isNativeTarget } from "@/lib/platform/target";

const APPLE_TOKEN_EXCHANGE_DEADLINE_MS = 12_000;
const APPLE_SESSION_INSTALL_DEADLINE_MS = 12_000;
const MAX_APPLE_IDENTITY_TOKEN_LENGTH = 32_768;
const MAX_APPLE_NONCE_LENGTH = 256;

interface NativeAppleAuthorization {
  identityToken: string;
  nonce: string;
}

interface NativeApplePlugin {
  authorize(): Promise<NativeAppleAuthorization>;
}

type AppleTokenClient = {
  auth: Pick<SupabaseClient["auth"], "signInWithIdToken">;
};

type AppleInstallationClient = {
  auth: Pick<SupabaseClient["auth"], "getSession" | "setSession">;
};

interface NativeAppleSignInOptions {
  applePlugin?: NativeApplePlugin;
  clearInstalledSession?: (
    expected: ExactNativeAuthSession,
  ) => Promise<ExactCredentialClearResult>;
  installationClient?: AppleInstallationClient;
  installationTimeoutMs?: number;
  tokenClient?: AppleTokenClient;
  tokenExchangeTimeoutMs?: number;
}

const NativeAppleSignIn = registerPlugin<NativeApplePlugin>(
  "NativeAppleSignIn",
);

/** Identifies a person dismissing Apple's sheet without treating it as failure. */
export function nativeAppleSignInWasCancelled(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "APPLE_SIGN_IN_CANCELLED"
  );
}

/** Requires a fresh document after an ambiguous Keychain installation. */
export class NativeAppleInstallationRecoveryError extends Error {
  readonly code = "native_apple_installation_recovery_required";
  readonly reloadRequired = true;

  constructor() {
    super("Apple session installation needs a safe reload.");
    this.name = "NativeAppleInstallationRecoveryError";
  }
}

/** Recognizes the recovery signal after bundling or lazy-module boundaries. */
export function nativeAppleInstallationNeedsReload(error: unknown): boolean {
  return (
    error instanceof NativeAppleInstallationRecoveryError ||
    (Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code ===
        "native_apple_installation_recovery_required")
  );
}

/** Accepts only bounded native values and never records their contents. */
function validAppleAuthorization(
  authorization: NativeAppleAuthorization,
): boolean {
  return (
    typeof authorization.identityToken === "string" &&
    authorization.identityToken.length > 0 &&
    authorization.identityToken.length <= MAX_APPLE_IDENTITY_TOKEN_LENGTH &&
    typeof authorization.nonce === "string" &&
    authorization.nonce.length >= 16 &&
    authorization.nonce.length <= MAX_APPLE_NONCE_LENGTH
  );
}

/** Requires a complete provider session before any Keychain mutation begins. */
function verifiedAppleSession(
  data: Awaited<
    ReturnType<SupabaseClient["auth"]["signInWithIdToken"]>
  >["data"],
): Session {
  const session = data.session;
  const user = data.user;
  if (
    !session ||
    !user ||
    !session.access_token ||
    !session.refresh_token ||
    !session.user.id ||
    session.user.id !== user.id
  ) {
    throw new Error("Apple sign-in returned an invalid account session.");
  }
  return session;
}

/** Captures the exact provider credential for compare-and-clear recovery. */
function exactAppleCredential(session: Session): ExactNativeAuthSession {
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}

/** Prefers any rotated credential returned by the durable installer. */
function installedAppleCredential(
  installed: Awaited<ReturnType<SupabaseClient["auth"]["setSession"]>>,
  fallback: ExactNativeAuthSession,
): ExactNativeAuthSession {
  const session = installed.data.session;
  if (
    session &&
    session.user.id === fallback.userId &&
    session.access_token &&
    session.refresh_token
  ) {
    return exactAppleCredential(session);
  }
  return fallback;
}

/** Treats only an exact removal or a proved replacement as safe cleanup. */
function appleCredentialWasReconciled(
  result: ExactCredentialClearResult,
): boolean {
  return (
    result === "cleared" ||
    result === "different-session" ||
    result === "missing"
  );
}

/**
 * Uses Apple's native sheet, exchanges its nonce-bound token off-storage, and
 * installs only that exact Supabase identity under the account lifecycle lock.
 */
export async function signInWithNativeApple(
  options: NativeAppleSignInOptions = {},
): Promise<void> {
  if (!isNativeTarget()) {
    throw new Error("Native Apple sign-in is unavailable on this platform.");
  }

  const lifecycleRevision = requireAccountLifecycleIdle();
  const applePlugin = options.applePlugin ?? NativeAppleSignIn;
  let identityToken = "";
  let nonce = "";
  let providerSession: Session;
  try {
    const authorization = await applePlugin.authorize();
    if (!validAppleAuthorization(authorization)) {
      throw new Error("Apple sign-in returned an invalid authorization.");
    }
    identityToken = authorization.identityToken;
    nonce = authorization.nonce;
    requireAccountLifecycleIdle(lifecycleRevision);

    const tokenClient = options.tokenClient ?? createAppleIdTokenAuthClient();
    const exchange = await withDeadline(
      tokenClient.auth.signInWithIdToken({
        provider: "apple",
        token: identityToken,
        nonce,
      }),
      options.tokenExchangeTimeoutMs ?? APPLE_TOKEN_EXCHANGE_DEADLINE_MS,
      "Apple account verification",
    );
    if (exchange.error) throw exchange.error;
    providerSession = verifiedAppleSession(exchange.data);
  } finally {
    // Minimize the lifetime of Apple bearer material in the WebView heap.
    identityToken = "";
    nonce = "";
  }

  requireAccountLifecycleIdle(lifecycleRevision);
  const lifecycle = beginAccountLifecycle(providerSession.user.id);
  if (!lifecycle) throw new AccountLifecycleBusyError();

  let releaseLifecycle = true;
  try {
    const installationClient = options.installationClient ?? createClient();
    const current = await withDeadline(
      installationClient.auth.getSession(),
      APPLE_SESSION_INSTALL_DEADLINE_MS,
      "Current account confirmation",
    );
    if (current.error) throw current.error;
    if (
      current.data.session &&
      current.data.session.user.id !== providerSession.user.id
    ) {
      throw new Error("The signed-in account changed before Apple finished.");
    }

    const fallback = exactAppleCredential(providerSession);
    const clear =
      options.clearInstalledSession ??
      ((expected: ExactNativeAuthSession) => clearExactAuthSession(expected));
    const installation = installationClient.auth.setSession({
      access_token: providerSession.access_token,
      refresh_token: providerSession.refresh_token,
    });
    let installed: Awaited<typeof installation>;
    try {
      installed = await withDeadline(
        installation,
        options.installationTimeoutMs ?? APPLE_SESSION_INSTALL_DEADLINE_MS,
        "Apple session installation",
      );
    } catch (error) {
      if (error instanceof DeadlineError) {
        // The exact lifecycle stays closed until the late Keychain write ends.
        releaseLifecycle = false;
        void installation.then(
          () => finishAccountLifecycle(lifecycle),
          () => finishAccountLifecycle(lifecycle),
        );
        throw new NativeAppleInstallationRecoveryError();
      }
      let reconciled = false;
      try {
        reconciled = appleCredentialWasReconciled(await clear(fallback));
      } catch {
        reconciled = false;
      }
      if (!reconciled) {
        releaseLifecycle = false;
        throw new NativeAppleInstallationRecoveryError();
      }
      throw error;
    }

    const responseMatches =
      !installed.error &&
      installed.data.user?.id === providerSession.user.id &&
      installed.data.session?.user.id === providerSession.user.id;
    if (responseMatches) return;

    let reconciled = false;
    try {
      reconciled = appleCredentialWasReconciled(
        await clear(installedAppleCredential(installed, fallback)),
      );
    } catch {
      reconciled = false;
    }
    if (!reconciled) {
      releaseLifecycle = false;
      throw new NativeAppleInstallationRecoveryError();
    }
    if (installed.error) throw installed.error;
    throw new Error("Apple sign-in changed identity during installation.");
  } finally {
    if (releaseLifecycle) finishAccountLifecycle(lifecycle);
  }
}
