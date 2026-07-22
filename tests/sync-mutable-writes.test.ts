import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  MutableAccountSyncContractError,
  writeMutableAccountRows,
} from "@/lib/sync/mutable-writes";

/** Build the minimal RPC-only client used by the guarded write tests. */
function rpcClient(
  rpc: ReturnType<typeof vi.fn>,
): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

describe("mutable account writes", () => {
  it("sends the exact guarded RPC payload without caller ownership", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { applied: 1, stale: 0, generation: 4 },
      error: null,
    });

    await expect(
      writeMutableAccountRows(rpcClient(rpc), "expected-user", 4, "prayers", [
        {
          id: "7bbfc4ec-ed55-4bf8-a07f-e0f8d4c40527",
          user_id: "caller-controlled-user",
          body: "private content",
          updated_at: "2026-07-22T19:30:00.000Z",
        },
      ]),
    ).resolves.toEqual({ applied: 1, stale: 0, generation: 4 });

    expect(rpc).toHaveBeenCalledWith("upsert_mutable_account_rows", {
      p_expected_user_id: "expected-user",
      p_expected_generation: 4,
      p_resource: "prayers",
      p_rows: [
        {
          id: "7bbfc4ec-ed55-4bf8-a07f-e0f8d4c40527",
          body: "private content",
          updated_at: "2026-07-22T19:30:00.000Z",
        },
      ],
    });
  });

  it("removes a profile owner id because the server uses auth.uid", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { applied: 0, stale: 1, generation: 4 },
      error: null,
    });

    await writeMutableAccountRows(rpcClient(rpc), "expected-user", 4, "profiles", [
      {
        id: "caller-controlled-user",
        display_name: "friend",
        updated_at: "2026-07-22T19:30:00.000Z",
      },
    ]);

    expect(rpc).toHaveBeenCalledWith("upsert_mutable_account_rows", {
      p_expected_user_id: "expected-user",
      p_expected_generation: 4,
      p_resource: "profiles",
      p_rows: [
        {
          display_name: "friend",
          updated_at: "2026-07-22T19:30:00.000Z",
        },
      ],
    });
  });

  it("propagates RPC errors without attempting an unsafe table fallback", async () => {
    const unavailable = {
      code: "PGRST202",
      message: "Could not find the function public.upsert_mutable_account_rows",
    };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: unavailable });
    const client = rpcClient(rpc);

    await expect(
      writeMutableAccountRows(client, "expected-user", 4, "user_settings", [
        { theme: "dark", updated_at: "2026-07-22T19:30:00.000Z" },
      ]),
    ).rejects.toBe(unavailable);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect("from" in client).toBe(false);
  });

  it("fails closed when the acknowledgement is malformed", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        applied: 1,
        stale: 0,
        generation: 4,
        rows: [{ body: "leak" }],
      },
      error: null,
    });

    await expect(
      writeMutableAccountRows(
        rpcClient(rpc),
        "expected-user",
        4,
        "reflections",
        [
          {
            id: "f55c287d-0fb2-4466-a2b0-1b9a370710d0",
            body: "private content",
            updated_at: "2026-07-22T19:30:00.000Z",
          },
        ],
      ),
    ).rejects.toBeInstanceOf(MutableAccountSyncContractError);
  });

  it("fails closed when the acknowledgement silently omits an input row", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { applied: 0, stale: 0, generation: 4 },
      error: null,
    });

    await expect(
      writeMutableAccountRows(rpcClient(rpc), "expected-user", 4, "prayers", [
        {
          id: "7bbfc4ec-ed55-4bf8-a07f-e0f8d4c40527",
          body: "private content",
          updated_at: "2026-07-22T19:30:00.000Z",
        },
      ]),
    ).rejects.toBeInstanceOf(MutableAccountSyncContractError);
  });

  it("returns locally for an empty batch", async () => {
    const rpc = vi.fn();

    await expect(
      writeMutableAccountRows(
        rpcClient(rpc),
        "expected-user",
        4,
        "notification_preferences",
        [],
      ),
    ).resolves.toEqual({ applied: 0, stale: 0, generation: 4 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
