import type { SupabaseClient } from "@supabase/supabase-js";

export const DAILY_QUEST_SYNC_CONTRACT = "biblequest_daily_quest_sync_v1";
export const ACCOUNT_SYNC_CONTRACT = "biblequest_account_sync_v3";

/** Report a missing or malformed server boundary without attempting writes. */
export class AccountSyncContractError extends Error {
  constructor() {
    super("The account sync server contract is unavailable.");
    this.name = "AccountSyncContractError";
  }
}

/** Accept only a fixed two-field readiness response. */
function isReadyContract(value: unknown, expected: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { contract?: unknown; ok?: unknown };
  return (
    Object.keys(value).sort().join(",") === "contract,ok" &&
    candidate.contract === expected &&
    candidate.ok === true
  );
}

/** Prove both write protocols before the engine reads or writes user data. */
export async function assertAccountSyncContracts(supabase: SupabaseClient) {
  const [daily, account] = await Promise.all([
    supabase.rpc("daily_quest_sync_contract"),
    supabase.rpc("account_sync_contract"),
  ]);
  if (
    daily.error ||
    account.error ||
    !isReadyContract(daily.data, DAILY_QUEST_SYNC_CONTRACT) ||
    !isReadyContract(account.data, ACCOUNT_SYNC_CONTRACT)
  ) {
    throw new AccountSyncContractError();
  }
}
