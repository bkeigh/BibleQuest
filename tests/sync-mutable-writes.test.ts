import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createMutableRevisionContext,
  reconcileMutableRows,
  restoreMutableRevisionContext,
} from "@/lib/sync/mutable-revisions";
import {
  MutableAccountSyncContractError,
  writeMutableAccountRows,
} from "@/lib/sync/mutable-writes";

const USER_ID = "7bbfc4ec-ed55-4bf8-a07f-e0f8d4c40527";

/** Build the minimal RPC-only client used by guarded write tests. */
function rpcClient(rpc: ReturnType<typeof vi.fn>): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

/** Establish one absent canonical resource before preparing an insert. */
async function emptyContext(resource: "prayers" | "profiles") {
  const context = createMutableRevisionContext();
  restoreMutableRevisionContext(context, USER_ID, 4, false, null);
  await reconcileMutableRows(context, resource, [], [], {
    expectedUserId: USER_ID,
  });
  return context;
}

describe("mutable account writes", () => {
  it("sends exact revision envelopes without caller ownership", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        generation: 4,
        results: [
          { key: { id: USER_ID }, status: "applied", revision: 1 },
        ],
      },
      error: null,
    });
    const context = await emptyContext("prayers");

    await expect(
      writeMutableAccountRows(
        rpcClient(rpc),
        USER_ID,
        4,
        "prayers",
        [
          {
            id: USER_ID,
            user_id: "caller-controlled-user",
            body: "private content",
            updated_at: "2026-07-22T19:30:00.000Z",
          },
        ],
        context,
      ),
    ).resolves.toEqual({ applied: 1, stale: 0, generation: 4 });

    expect(rpc).toHaveBeenCalledWith("upsert_mutable_account_rows", {
      p_expected_user_id: USER_ID,
      p_expected_generation: 4,
      p_resource: "prayers",
      p_rows: [
        {
          expected_revision: 0,
          row: {
            id: USER_ID,
            body: "private content",
            updated_at: "2026-07-22T19:30:00.000Z",
          },
        },
      ],
    });
  });

  it("uses the authenticated profile id only in the attributable result key", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        generation: 4,
        results: [
          { key: { id: USER_ID }, status: "applied", revision: 1 },
        ],
      },
      error: null,
    });
    const context = await emptyContext("profiles");

    await writeMutableAccountRows(
      rpcClient(rpc),
      USER_ID,
      4,
      "profiles",
      [
        {
          id: "caller-controlled-user",
          display_name: "friend",
          updated_at: "2026-07-22T19:30:00.000Z",
        },
      ],
      context,
    );

    expect(rpc).toHaveBeenCalledWith(
      "upsert_mutable_account_rows",
      expect.objectContaining({
        p_rows: [
          {
            expected_revision: 0,
            row: {
              display_name: "friend",
              updated_at: "2026-07-22T19:30:00.000Z",
            },
          },
        ],
      }),
    );
  });

  it("persists applied siblings before returning a partial conflict", async () => {
    const context = await emptyContext("prayers");
    const first = {
      id: "11111111-1111-4111-8111-111111111111",
      body: "first",
      updated_at: "2026-07-22T19:30:00.000Z",
    };
    const second = {
      id: "22222222-2222-4222-8222-222222222222",
      body: "second",
      updated_at: "2026-07-22T19:30:00.000Z",
    };
    const rpc = vi.fn().mockResolvedValue({
      data: {
        generation: 4,
        results: [
          { key: { id: first.id }, status: "applied", revision: 1 },
          { key: { id: second.id }, status: "conflict", revision: 2 },
        ],
      },
      error: null,
    });

    await expect(
      writeMutableAccountRows(
        rpcClient(rpc),
        USER_ID,
        4,
        "prayers",
        [first, second],
        context,
      ),
    ).resolves.toEqual({ applied: 1, stale: 1, generation: 4 });

    const retry = vi.fn();
    await writeMutableAccountRows(
      rpcClient(retry),
      USER_ID,
      4,
      "prayers",
      [first],
      context,
    );
    expect(retry).not.toHaveBeenCalled();
  });

  it("fails closed for malformed, reordered, or leaking acknowledgements", async () => {
    const invalid = [
      {
        generation: 4,
        results: [{ key: { id: USER_ID }, status: "applied", revision: 1 }],
        rows: [{ body: "leak" }],
      },
      {
        generation: 4,
        results: [{ key: { id: "wrong" }, status: "applied", revision: 1 }],
      },
      {
        generation: 4,
        results: [{ key: { id: USER_ID }, status: "applied", revision: -1 }],
      },
    ];

    for (const data of invalid) {
      const context = await emptyContext("prayers");
      await expect(
        writeMutableAccountRows(
          rpcClient(vi.fn().mockResolvedValue({ data, error: null })),
          USER_ID,
          4,
          "prayers",
          [
            {
              id: USER_ID,
              body: "private content",
              updated_at: "2026-07-22T19:30:00.000Z",
            },
          ],
          context,
        ),
      ).rejects.toBeInstanceOf(MutableAccountSyncContractError);
    }
  });

  it("propagates RPC errors without an unsafe table fallback", async () => {
    const unavailable = { code: "PGRST202", message: "function missing" };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: unavailable });
    const context = await emptyContext("prayers");

    await expect(
      writeMutableAccountRows(
        rpcClient(rpc),
        USER_ID,
        4,
        "prayers",
        [
          {
            id: USER_ID,
            body: "private content",
            updated_at: "2026-07-22T19:30:00.000Z",
          },
        ],
        context,
      ),
    ).rejects.toBe(unavailable);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
