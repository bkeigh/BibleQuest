"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteRemoteAvatar } from "@/lib/avatar/client";
import { createClient } from "@/lib/supabase/client";
import { withDeadline } from "@/lib/async/deadline";

const ACCOUNT_DELETION_DEADLINE_MS = 15_000;

/** Bounded UI error that never exposes provider or account details. */
export class AccountDeletionError extends Error {
  constructor() {
    super("BibleQuest could not delete the account.");
    this.name = "AccountDeletionError";
  }
}

/**
 * Deletes only the identity in the current authenticated JWT. Local sign-out
 * is best effort after server success; callers must still clear device data.
 */
export async function deleteOwnAccount(
  client: SupabaseClient = createClient(),
): Promise<void> {
  const { error } = await withDeadline(
    client.rpc("delete_own_account"),
    ACCOUNT_DELETION_DEADLINE_MS,
    "Account deletion",
  );
  if (error) throw new AccountDeletionError();

  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // The server identity is already gone; device cleanup remains authoritative.
  }
}

/** Removes Storage ownership first, then deletes the authenticated identity. */
export async function deleteOwnAccountWithAvatar(
  removeOwnedAvatars: () => Promise<void> = () => deleteRemoteAvatar(true),
  deleteAccount: () => Promise<void> = () => deleteOwnAccount(),
): Promise<void> {
  await removeOwnedAvatars();
  await deleteAccount();
}
