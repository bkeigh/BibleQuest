/** Fail closed unless a reviewed build explicitly enables account sync. */
export function accountSyncContained(enabled: string | undefined): boolean {
  return enabled !== "true";
}

export const ACCOUNT_SYNC_CONTAINED = accountSyncContained(
  process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED,
);

/** Truthful copy shared by every disabled account-sync entry point. */
export const ACCOUNT_SYNC_CONTAINMENT_NOTICE =
  "Account sync is temporarily unavailable. Your journey is staying on this device.";

/** Allows one explicit latch change to restore sync after the exit gates pass. */
export function accountSyncAvailable(
  supabaseConfigured: boolean,
  contained = ACCOUNT_SYNC_CONTAINED,
): boolean {
  return supabaseConfigured && !contained;
}
