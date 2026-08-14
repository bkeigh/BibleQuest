"use client";

import { DeadlineError, withDeadline } from "@/lib/async/deadline";
import { isNativeTarget } from "@/lib/platform/target";
import {
  createAccountSignOutClient,
  createClient,
} from "@/lib/supabase/client";
import {
  clearRevokedWebAuthSubject,
  markWebAccountSigningOut,
  readWebAuthState,
  requireCurrentWebAccountRealm,
  withWebPrivateLegacyAbsenceAudit,
  withWebAccountOperationLock,
  type SubjectClearResult,
  type WebAccountOperationHandle,
} from "@/lib/supabase/web-auth-storage";
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

export interface AccountSignOutOptions {
  authClient?: AccountAuthClient;
  clearSession?: (
    expected: ExactNativeAuthSession,
  ) => Promise<ExactCredentialClearResult>;
  clearWebSubject?: (
    expectedUserId: string,
    webOperation: WebAccountOperationHandle,
  ) => Promise<SubjectClearResult>;
  deadlineMs?: number;
  native?: boolean;
  revocationClient?: AccountRevocationClient;
}

export type AccountSignOutResult =
  | { status: "signed-out"; reloadRequired: boolean }
  | { status: "session-changed"; reloadRequired: true };

/** Content-free failure that tells account UI when recovery needs a reload. */
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

/** Removes ed28-readable residue before a marked web sign-out clears cookies. */
export async function prepareMarkedWebAccountSignOut(
  webOperation: WebAccountOperationHandle,
  expectedUserId: string,
): Promise<boolean> {
  try {
    await requireCurrentWebAccountRealm(webOperation);
  } catch {
    return false;
  }
  const { removeAndProveLegacyWebPrivateResidue } = await import(
    "@/lib/storage/web-private-cutover"
  );
  return withWebPrivateLegacyAbsenceAudit(
    webOperation,
    expectedUserId,
    () =>
      removeAndProveLegacyWebPrivateResidue(
        webOperation,
        expectedUserId,
      ),
  );
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
 * Revoke through storage-free auth, then remove only the captured credential.
 * Journey data is deliberately outside this ordinary sign-out path.
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
      const guardedSignOut = withWebAccountOperationLock(async (webOperation) => {
        let webRevocationStarted = false;
        let webMarked = false;
        try {
          refreshPaused = true;
          await authClient.auth.stopAutoRefresh();
          const current = await authClient.auth.getSession();
          requireCurrentLifecycle(lifecycle);
          const session = current.data.session;
          if (!current.error && !session) {
            const resumed = await resumeAfterRefusal(authClient);
            refreshPaused = !resumed;
            if (!resumed) {
              releaseLifecycle = false;
              throw new AccountSignOutError(true);
            }
            return {
              status: "signed-out" as const,
              reloadRequired: true as const,
            };
          }
          if (
            !current.error &&
            session &&
            session.user.id !== expectedUserId
          ) {
            const resumed = await resumeAfterRefusal(authClient);
            refreshPaused = !resumed;
            if (!resumed) {
              releaseLifecycle = false;
              throw new AccountSignOutError(true);
            }
            return {
              status: "session-changed" as const,
              reloadRequired: true as const,
            };
          }

          const expected = exactSession(expectedUserId, current);
          const marked = await markWebAccountSigningOut(
            webOperation,
            expected,
          );
          if (marked !== "marked") throw new AccountSignOutError();
          webMarked = true;
          if (
            !(await prepareMarkedWebAccountSignOut(
              webOperation,
              expectedUserId,
            ))
          ) {
            throw new AccountSignOutError();
          }
          const revocationClient =
            options.revocationClient ?? createAccountSignOutClient();
          webRevocationStarted = true;
          const revoked = await revocationClient.auth.admin.signOut(
            expected.accessToken,
            "global",
          );
          if (revoked.error) throw new AccountSignOutError();
          remoteRevoked = true;
          requireCurrentLifecycle(lifecycle);

          const clearWebSubject =
            options.clearWebSubject ??
            ((userId: string, handle: WebAccountOperationHandle) =>
              clearRevokedWebAuthSubject(handle, userId));
          const cleared = await clearWebSubject(expectedUserId, webOperation);
          requireCurrentLifecycle(lifecycle);
          if (cleared === "different-user") {
            return {
              status: "session-changed" as const,
              reloadRequired: true as const,
            };
          }
          if (cleared !== "cleared" && cleared !== "missing") {
            throw new AccountSignOutError(true);
          }
          return {
            status: "signed-out" as const,
            reloadRequired: true as const,
          };
        } catch (error) {
          if (webMarked) releaseLifecycle = false;
          if (webRevocationStarted && !remoteRevoked) {
            // The storage-free request has fully settled before this branch;
            // reload may now verify A without any late revocation continuation.
            throw new AccountSignOutError(true);
          }
          if (!webMarked && !remoteRevoked && refreshPaused) {
            const resumed = await resumeAfterRefusal(authClient);
            refreshPaused = !resumed;
            if (!resumed) {
              throw new AccountSignOutError(true);
            }
          }
          if (remoteRevoked) {
            throw new AccountSignOutError(true);
          }
          if (error instanceof AccountSignOutError) throw error;
          throw new AccountSignOutError();
        }
      });
      try {
        return await withDeadline(
          guardedSignOut,
          deadlineMs,
          "Guarded web account sign-out",
        );
      } catch (error) {
        if (error instanceof DeadlineError) {
          // The caller can recover its UI, but the Web Lock and lifecycle stay
          // owned until every non-cancellable continuation has really settled.
          releaseLifecycle = false;
          void guardedSignOut.then(
            () => finishAccountLifecycle(lifecycle),
            () => finishAccountLifecycle(lifecycle),
          );
          throw new AccountSignOutError(false);
        }
        throw error;
      }
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

/** Resumes one durable web sign-out without exposing its retained session. */
export async function resumeMarkedWebAccountSignOut(
  expected: ExactNativeAuthSession,
  lifecycle: AccountLifecycleHandle,
  webOperation: WebAccountOperationHandle,
  revocationClient: AccountRevocationClient = createAccountSignOutClient(),
): Promise<boolean> {
  requireCurrentLifecycle(lifecycle);
  const state = await readWebAuthState(webOperation);
  if (
    state.status !== "stored" ||
    state.mode !== "signing-out" ||
    !exactCredentialMatchesForResume(state.credential, expected)
  ) {
    return false;
  }
  if (
    !(await prepareMarkedWebAccountSignOut(
      webOperation,
      expected.userId,
    ))
  ) {
    return false;
  }
  const revoked = await revocationClient.auth.admin.signOut(
    expected.accessToken,
    "global",
  );
  if (revoked.error) return false;
  requireCurrentLifecycle(lifecycle);
  const cleared = await clearRevokedWebAuthSubject(
    webOperation,
    expected.userId,
  );
  requireCurrentLifecycle(lifecycle);
  return cleared === "cleared" || cleared === "missing";
}

/** Compares retained credentials without exposing their values. */
function exactCredentialMatchesForResume(
  left: ExactNativeAuthSession,
  right: ExactNativeAuthSession,
): boolean {
  return (
    left.userId === right.userId &&
    left.accessToken === right.accessToken &&
    left.refreshToken === right.refreshToken
  );
}
