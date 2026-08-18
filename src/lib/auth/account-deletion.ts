"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteRemoteAvatar } from "@/lib/avatar/client";
import {
  createClient,
  createSyncControlClient,
} from "@/lib/supabase/client";
import {
  markWebAccountDeleting,
  readWebAuthState,
  withTerminalWebPrivateWriteCleanup,
  withWebAccountOperationLock,
  type WebAccountOperationHandle,
} from "@/lib/supabase/web-auth-storage";
import { DeadlineError, withDeadline } from "@/lib/async/deadline";
import { isNativeTarget } from "@/lib/platform/target";
import {
  ACCOUNT_SYNC_CONTAINED,
  NATIVE_ACCOUNT_BETA_ENABLED,
} from "@/lib/sync/containment";
import { purgeDeletedAccountDeviceData } from "./device-account-cleanup";
import type { AccountLifecycleHandle } from "./account-lifecycle";

export const ACCOUNT_DELETION_DEADLINE_MS = 15_000;
export const ACCOUNT_DELETION_STATUS_CONTRACT =
  "biblequest_account_deletion_status_v1";

/** Bounded UI error that never exposes provider or account details. */
export class AccountDeletionError extends Error {
  constructor() {
    super("BibleQuest could not delete the account.");
    this.name = "AccountDeletionError";
  }
}

/** Marks an irreversible request whose server outcome is still ambiguous. */
export class AccountDeletionPendingError extends Error {
  readonly code = "account_deletion_pending";

  constructor() {
    super("BibleQuest is still confirming account deletion.");
    this.name = "AccountDeletionPendingError";
  }
}

/** Rejects any status response outside the sealed server contract. */
function exactDeletionStatus(value: unknown): boolean | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "contract" ||
    keys[1] !== "pending" ||
    record.contract !== ACCOUNT_DELETION_STATUS_CONTRACT ||
    typeof record.pending !== "boolean"
  ) {
    return null;
  }
  return record.pending;
}

/** Reads only the authenticated owner's exact durable deletion latch. */
export async function ownAccountDeletionIsPending(
  expectedUserId: string,
  client: SupabaseClient = createSyncControlClient(expectedUserId),
): Promise<boolean> {
  try {
    const result = await withDeadline(
      client.rpc("own_account_deletion_status"),
      ACCOUNT_DELETION_DEADLINE_MS,
      "Account deletion status",
    );
    const pending = exactDeletionStatus(result.data);
    if (result.error || pending === null) throw new AccountDeletionError();
    return pending;
  } catch (error) {
    if (error instanceof AccountDeletionError) throw error;
    throw new AccountDeletionError();
  }
}

/** Treat transport-like results as ambiguous after the irreversible RPC ran. */
function accountDeletionOutcomeIsAmbiguous(result: {
  error: unknown;
  status?: unknown;
}): boolean {
  return Boolean(
    result.error &&
      (result.status === 0 ||
        (typeof result.status === "number" && result.status >= 500)),
  );
}

/**
 * On explicit user request, recover only the verified subject needed for
 * deletion while the live account beta is disabled. No normal account UI,
 * sync, or other API request may use this path.
 */
export async function verifiedNativeDeletionUserId(
  authClient: SupabaseClient = createClient(),
): Promise<string> {
  if (
    !isNativeTarget() ||
    ACCOUNT_SYNC_CONTAINED ||
    !NATIVE_ACCOUNT_BETA_ENABLED
  ) {
    throw new AccountDeletionError();
  }
  try {
    const observed = await withDeadline(
      authClient.auth.getSession(),
      ACCOUNT_DELETION_DEADLINE_MS,
      "Deletion session lookup",
    );
    const session = observed.data.session;
    if (
      observed.error ||
      !session?.access_token ||
      !session.user.id
    ) {
      throw new AccountDeletionError();
    }
    const verified = await withDeadline(
      authClient.auth.getUser(session.access_token),
      ACCOUNT_DELETION_DEADLINE_MS,
      "Deletion identity verification",
    );
    const current = await withDeadline(
      authClient.auth.getSession(),
      ACCOUNT_DELETION_DEADLINE_MS,
      "Deletion session confirmation",
    );
    if (
      verified.error ||
      verified.data.user?.id !== session.user.id ||
      current.error ||
      current.data.session?.user.id !== session.user.id ||
      current.data.session.access_token !== session.access_token
    ) {
      throw new AccountDeletionError();
    }
    return session.user.id;
  } catch (error) {
    if (error instanceof AccountDeletionError) throw error;
    throw new AccountDeletionError();
  } finally {
    // This deletion-only singleton is created after normal availability
    // suspension, so explicitly prevent it from refreshing while beta is off.
    try {
      authClient.auth.stopAutoRefresh();
    } catch {
      // The explicit deletion attempt still fails closed on any auth error.
    }
  }
}

/**
 * Deletes only the identity in the current authenticated JWT. The verified
 * device cleanup retains the credential until every local purge succeeds.
 */
export async function deleteOwnAccount(
  expectedUserId: string,
  client: SupabaseClient = createSyncControlClient(expectedUserId),
  webOperation?: WebAccountOperationHandle,
): Promise<void> {
  const removeExpectedAccount = async () => {
    let result;
    try {
      result = await client.rpc("delete_own_account");
    } catch {
      // A thrown transport failure or deadline cannot prove whether the server
      // committed the irreversible deletion, so normal auth must remain paused.
      throw new AccountDeletionPendingError();
    }
    const { error } = result;
    if (accountDeletionOutcomeIsAmbiguous(result)) {
      throw new AccountDeletionPendingError();
    }
    if (error) throw new AccountDeletionError();
  };

  // Web account mutations share one cross-tab boundary; native is serialized
  // by its existing device lifecycle and exact Keychain primitives.
  if (isNativeTarget()) return removeExpectedAccount();
  return withWebAccountOperationLock(removeExpectedAccount, webOperation);
}

/** Runs the atomic remote avatar sweep and identity deletion endpoint. */
export async function deleteOwnAccountWithAvatar(
  expectedUserId: string,
  removeOwnedAvatars?: (userId: string) => Promise<void>,
  deleteAccount?: (userId: string) => Promise<void>,
  webOperation?: WebAccountOperationHandle,
): Promise<void> {
  try {
    await (removeOwnedAvatars
      ? removeOwnedAvatars(expectedUserId)
      : deleteRemoteAvatar(expectedUserId, {
          allOwnedObjects: true,
          accountDeletionCleanup: true,
          webOperation,
        }));
  } catch {
    // The deletion endpoint latches the owner before sweeping Storage. Once
    // dispatched, any failure is ambiguous and normal account use stays shut.
    throw new AccountDeletionPendingError();
  }
  // The production endpoint already calls delete_own_account after its sweep.
  // This callback remains only as a narrow test seam for operation ordering.
  if (deleteAccount) await deleteAccount(expectedUserId);
}

interface CompleteAccountDeletionOptions {
  deleteAccount?: (userId: string) => Promise<void>;
  purgeDevice?: (
    userId: string,
    lifecycle: AccountLifecycleHandle,
    webOperation?: WebAccountOperationHandle,
  ) => Promise<boolean>;
  removeOwnedAvatars?: (userId: string) => Promise<void>;
}

/** Holds avatar sweep, identity deletion, and device purge in one web lock. */
export async function deleteAccountAndDeviceData(
  expectedUserId: string,
  lifecycle: AccountLifecycleHandle,
  options: CompleteAccountDeletionOptions = {},
  webOperation?: WebAccountOperationHandle,
): Promise<boolean> {
  const operation = async (webOperation?: WebAccountOperationHandle) => {
    if (!isNativeTarget()) {
      if (!webOperation) throw new AccountDeletionPendingError();
      const state = await readWebAuthState(webOperation);
      if (
        state.status !== "stored" ||
        state.credential.userId !== expectedUserId ||
        (state.mode !== "active" && state.mode !== "deleting")
      ) {
        throw new AccountDeletionPendingError();
      }
      const marked = await markWebAccountDeleting(
        webOperation,
        state.credential,
      );
      if (marked !== "marked") throw new AccountDeletionPendingError();
    }
    await deleteOwnAccountWithAvatar(
      expectedUserId,
      options.removeOwnedAvatars,
      options.deleteAccount,
      webOperation,
    );
    const purgeDevice = options.purgeDevice ?? purgeDeletedAccountDeviceData;
    const purge = () =>
      purgeDevice(expectedUserId, lifecycle, webOperation);
    return webOperation
      ? withTerminalWebPrivateWriteCleanup(
          webOperation,
          expectedUserId,
          purge,
        )
      : purge();
  };
  const guarded = isNativeTarget()
    ? operation()
    : withWebAccountOperationLock(operation, webOperation);
  // A caller already inside the Web Lock must await the raw work itself so
  // no inner visible deadline can release that outer ownership prematurely.
  if (webOperation) return guarded;
  try {
    return await withDeadline(
      guarded,
      ACCOUNT_DELETION_DEADLINE_MS,
      "Complete account deletion",
    );
  } catch (error) {
    if (error instanceof DeadlineError) {
      // The deadline is caller-visible only. Raw non-cancellable work retains
      // the lifecycle and Web Lock until its final compare-and-clear settles.
      void guarded.then(
        () => undefined,
        () => undefined,
      );
      throw new AccountDeletionPendingError();
    }
    throw error;
  }
}
