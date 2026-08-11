"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteRemoteAvatar } from "@/lib/avatar/client";
import {
  createClient,
  createSyncControlClient,
} from "@/lib/supabase/client";
import { DeadlineError, withDeadline } from "@/lib/async/deadline";
import { isNativeTarget } from "@/lib/platform/target";
import {
  ACCOUNT_SYNC_CONTAINED,
  NATIVE_ACCOUNT_BETA_ENABLED,
} from "@/lib/sync/containment";

export const ACCOUNT_DELETION_DEADLINE_MS = 15_000;

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
 * Deletes only the identity in the current authenticated JWT. Local sign-out
 * is best effort after server success; callers must still clear device data.
 */
export async function deleteOwnAccount(
  expectedUserId: string,
  client: SupabaseClient = createSyncControlClient(expectedUserId),
  authClient: SupabaseClient = createClient(),
): Promise<void> {
  let result;
  try {
    result = await withDeadline(
      client.rpc("delete_own_account"),
      ACCOUNT_DELETION_DEADLINE_MS,
      "Account deletion",
    );
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
  // Native account deletion clears Keychain inside the serialized, expected-
  // user device lifecycle; a separate signOut could erase a newer account.
  if (isNativeTarget()) return;

  try {
    const session = await authClient.auth.getSession();
    if (session.data.session?.user.id === expectedUserId) {
      await authClient.auth.signOut({ scope: "local" });
    }
  } catch {
    // The expected server identity is gone; account-scoped cleanup continues.
  }
}

/** Removes Storage ownership first, then deletes the authenticated identity. */
export async function deleteOwnAccountWithAvatar(
  expectedUserId: string,
  removeOwnedAvatars: (userId: string) => Promise<void> = (userId) =>
    deleteRemoteAvatar(userId, {
      allOwnedObjects: true,
      accountDeletionCleanup: true,
    }),
  deleteAccount: (userId: string) => Promise<void> = (userId) =>
    deleteOwnAccount(userId),
): Promise<void> {
  try {
    await withDeadline(
      removeOwnedAvatars(expectedUserId),
      ACCOUNT_DELETION_DEADLINE_MS,
      "Account avatar deletion",
    );
  } catch (error) {
    if (error instanceof DeadlineError) throw new AccountDeletionPendingError();
    throw error;
  }
  await deleteAccount(expectedUserId);
}
