import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AccountSyncGenerationConflictError,
  accountSyncRequestId,
  deleteAccountSyncRows,
  isAccountSyncGenerationConflict,
  purgeAccountSyncRows,
  readAccountSyncGeneration,
} from "@/lib/sync/generation-boundary";

const USER_ID = "00000000-0000-4000-8000-000000000001";

/** Return the minimal expected-user generation RPC used by the helper. */
function generationClient(data: unknown, error: unknown = null): SupabaseClient {
  return {
    rpc: async () => ({ data, error }),
  } as unknown as SupabaseClient;
}

describe("account sync generation boundary", () => {
  it("reads only a non-negative safe generation", async () => {
    await expect(
      readAccountSyncGeneration(generationClient({ generation: 3 }), USER_ID),
    ).resolves.toBe(3);
    await expect(
      readAccountSyncGeneration(generationClient({ generation: -1 }), USER_ID),
    ).rejects.toThrow(
      "generation is unavailable",
    );
  });

  it("turns a serialization failure into a reconciliation conflict", async () => {
    expect(isAccountSyncGenerationConflict({ code: "40001" })).toBe(true);
    expect(isAccountSyncGenerationConflict({ code: "42501" })).toBe(false);
    await expect(
      readAccountSyncGeneration(
        generationClient(null, { code: "40001", message: "stale generation" }),
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(AccountSyncGenerationConflictError);
  });

  it("derives stable request ids that change with the generation", async () => {
    const payload = [{ resource: "prayers", id: USER_ID }];
    const first = await accountSyncRequestId(USER_ID, 2, "delete", payload);
    await expect(accountSyncRequestId(USER_ID, 2, "delete", payload)).resolves.toBe(first);
    await expect(accountSyncRequestId(USER_ID, 3, "delete", payload)).resolves.not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("sends the expected identity and generation and validates exact responses", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return name === "delete_user_sync_rows"
          ? { data: { deleted: 1, generation: 5, duplicate: false }, error: null }
          : { data: { generation: 6, duplicate: false }, error: null };
      },
    } as unknown as SupabaseClient;

    await expect(
      deleteAccountSyncRows(client, USER_ID, 4, [{ resource: "prayers", id: USER_ID }]),
    ).resolves.toEqual({ deleted: 1, generation: 5, duplicate: false });
    await expect(purgeAccountSyncRows(client, USER_ID, 5)).resolves.toEqual({
      generation: 6,
      duplicate: false,
    });
    expect(calls.map(({ name }) => name)).toEqual(["delete_user_sync_rows", "purge_user_data"]);
    expect(calls[0].args).toMatchObject({
      p_expected_user_id: USER_ID,
      p_expected_generation: 4,
    });
    expect(calls[1].args).toMatchObject({
      p_expected_user_id: USER_ID,
      p_expected_generation: 5,
    });
  });

  it("fails closed on extra destructive response fields", async () => {
    const client = {
      rpc: async () => ({
        data: { generation: 1, duplicate: false, unexpected: true },
        error: null,
      }),
    } as unknown as SupabaseClient;
    await expect(purgeAccountSyncRows(client, USER_ID, 0)).rejects.toThrow(
      "Invalid destructive account sync response",
    );
  });
});
