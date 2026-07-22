/**
 * Temporary incident latch for the production Journey schema mismatch.
 * Keep account data sync closed until migrations through 0015 are manually
 * verified together with the production content and isolation gates.
 */
export const ACCOUNT_SYNC_CONTAINED = true;

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
