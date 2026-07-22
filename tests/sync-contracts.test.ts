import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  AccountSyncContractError,
  assertAccountSyncContracts,
} from "@/lib/sync/contracts";

/** Build the minimal RPC client needed by the readiness preflight. */
function client(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    rpc: vi.fn(async (name: string) => responses[name]),
  } as unknown as SupabaseClient;
}

describe("account sync runtime contracts", () => {
  it("accepts only both exact ready contracts", async () => {
    await expect(
      assertAccountSyncContracts(
        client({
          daily_quest_sync_contract: {
            data: { contract: "biblequest_daily_quest_sync_v1", ok: true },
            error: null,
          },
          account_sync_contract: {
            data: { contract: "biblequest_account_sync_v4", ok: true },
            error: null,
          },
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a missing, false, or expanded account contract", async () => {
    const candidates = [
      null,
      { contract: "biblequest_account_sync_v4", ok: false },
      {
        contract: "biblequest_account_sync_v4",
        ok: true,
        diagnostic: "not allowed",
      },
    ];

    for (const candidate of candidates) {
      await expect(
        assertAccountSyncContracts(
          client({
            daily_quest_sync_contract: {
              data: { contract: "biblequest_daily_quest_sync_v1", ok: true },
              error: null,
            },
            account_sync_contract: { data: candidate, error: null },
          }),
        ),
      ).rejects.toBeInstanceOf(AccountSyncContractError);
    }
  });
});
