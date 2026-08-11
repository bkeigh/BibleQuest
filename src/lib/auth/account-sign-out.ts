"use client";

import { withDeadline } from "@/lib/async/deadline";
import { isNativeTarget } from "@/lib/platform/target";
import {
  createAccountSignOutClient,
  createClient,
} from "@/lib/supabase/client";
import {
  clearExactNativeAuthSession,
  type ExactCredentialClearResult,
  type ExactNativeAuthSession,
} from "@/lib/supabase/native-auth-storage";
import {
  AccountLifecycleBusyError,
  accountLifecycleHandleIsCurrent,
  beginAccountLifecycle,
  finishAccountLifecycle,
  type AccountLifecycleHandle,
} from "./account-lifecycle";

const ACCOUNT_SIGN_OUT_DEADLINE_MS = 12_000;
const MAX_ACCESS_TOKEN_LENGTH = 16_384;
const MAX_REFRESH_TOKEN_LENGTH = 8_192;

type CapturedSession = {
  access_token: string;
  refresh_token: string;
  user: { id: string };
};

type AccountAuthClient = {
  auth: {
    getSession: () => PromiseLike<{
      data: { session: CapturedSession | null };
      error: unknown;
    }>;
    signOut: () => PromiseLike<{ error: unknown }>;
    startAutoRefresh: () => PromiseLike<void>;
    stopAutoRefresh: () => PromiseLike<void>;
  };
};

type AccountRevocationClient = {
  auth: {
    admin: {
      signOut: (
        accessToken: string,
        scope: "global",
      ) => PromiseLike<{ error: unknown }>;
    };
  };
};

interface AccountSignOutOptions {
  authClient?: AccountAuthClient;
  clearSession?: (
    expected: ExactNativeAuthSession,
  ) => Promise<ExactCredentialClearResult>;
  deadlineMs?: number;
  native?: boolean;
  revocationClient?: AccountRevocationClient;
}

export type AccountSignOutResult =
  | { status: "signed-out"; reloadRequired: boolean }
  | { status: "session-changed"; reloadRequired: true };

/** Content-free failure that tells native UI when recovery needs a reload. */
export class AccountSignOutError extends Error {
  readonly code = "account_sign_out_failed";

  constructor(readonly reloadRequired = false) {
    super("The account could not be signed out safely.");
    this.name = "AccountSignOutError";
  }
}

/** Refuse continuations that no longer own the device account boundary. */
function requireCurrentLifecycle(handle: AccountLifecycleHandle): void {
  if (!accountLifecycleHandleIsCurrent(handle)) {
    throw new AccountSignOutError(true);
  }
}

/** Capture only one complete, bounded credential for the expected subject. */
function exactSession(
  expectedUserId: string,
  result: {
    data: { session: CapturedSession | null };
    error: unknown;
  },
): ExactNativeAuthSession {
  const session = result.data.session;
  if (
    result.error ||
    !session ||
    session.user.id !== expectedUserId ||
    !session.access_token ||
    session.access_token.length > MAX_ACCESS_TOKEN_LENGTH ||
    !session.refresh_token ||
    session.refresh_token.length > MAX_REFRESH_TOKEN_LENGTH
  ) {
    throw new AccountSignOutError();
  }
  return {
    userId: expectedUserId,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}

/** Restart native refresh after a refusal without changing the credential. */
async function resumeAfterRefusal(
  client: AccountAuthClient,
): Promise<boolean> {
  try {
    await client.auth.startAutoRefresh();
    return true;
  } catch {
    return false;
  }
}

/**
 * Revoke through storage-free auth, then remove only the captured Keychain
 * session. Journey data is deliberately outside this ordinary sign-out path.
 */
export async function signOutExpectedAccount(
  expectedUserId: string,
  options: AccountSignOutOptions = {},
): Promise<AccountSignOutResult> {
  const lifecycle = beginAccountLifecycle(expectedUserId);
  if (!lifecycle) throw new AccountLifecycleBusyError();

  const authClient = options.authClient ?? createClient();
  const native = options.native ?? isNativeTarget();
  const deadlineMs = options.deadlineMs ?? ACCOUNT_SIGN_OUT_DEADLINE_MS;
  let releaseLifecycle = true;
  let refreshPaused = false;
  let remoteRevoked = false;

  try {
    if (!native) {
      const result = await withDeadline(
        authClient.auth.signOut(),
        deadlineMs,
        "Account sign-out",
      );
      if (result.error) throw new AccountSignOutError();
      requireCurrentLifecycle(lifecycle);
      return { status: "signed-out", reloadRequired: false };
    }

    // Stop new refreshes before getSession waits for any current auth lock.
    try {
      refreshPaused = true;
      await authClient.auth.stopAutoRefresh();
      const current = await withDeadline(
        authClient.auth.getSession(),
        deadlineMs,
        "Account session capture",
      );
      requireCurrentLifecycle(lifecycle);
      const expected = exactSession(expectedUserId, current);
      const revocationClient =
        options.revocationClient ?? createAccountSignOutClient();
      const revoked = await withDeadline(
        revocationClient.auth.admin.signOut(expected.accessToken, "global"),
        deadlineMs,
        "Account sign-out",
      );
      if (revoked.error) throw new AccountSignOutError();
      remoteRevoked = true;
      requireCurrentLifecycle(lifecycle);

      const clearSession =
        options.clearSession ?? clearExactNativeAuthSession;
      const cleared = await withDeadline(
        clearSession(expected),
        deadlineMs,
        "Native credential removal",
      );
      requireCurrentLifecycle(lifecycle);

      if (cleared === "different-session") {
        return { status: "session-changed", reloadRequired: true };
      }
      if (cleared !== "cleared" && cleared !== "missing") {
        // The remote outcome is irreversible, so keep account work closed
        // until the caller reloads and Keychain can be reconciled afresh.
        releaseLifecycle = false;
        throw new AccountSignOutError(true);
      }
      return { status: "signed-out", reloadRequired: true };
    } catch (error) {
      if (!remoteRevoked && refreshPaused) {
        const resumed = await resumeAfterRefusal(authClient);
        refreshPaused = !resumed;
        if (!resumed) {
          releaseLifecycle = false;
          throw new AccountSignOutError(true);
        }
      }
      if (remoteRevoked) {
        releaseLifecycle = false;
        throw new AccountSignOutError(true);
      }
      if (error instanceof AccountSignOutError) throw error;
      throw new AccountSignOutError();
    }
  } finally {
    if (releaseLifecycle) finishAccountLifecycle(lifecycle);
  }
}
