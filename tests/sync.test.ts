import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS, emptyTombstones } from "@/lib/questos/types";
import { currentSnapshot, emptySnapshot } from "./fixtures";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  track: vi.fn(),
  generations: new Map<string, number>(),
  resetRequired: new Set<string>(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
  createSyncClient: () => mocks.createClient.mock.results.at(-1)?.value,
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/sync/generation", () => ({
  getAccountSyncGeneration: (userId: string) => mocks.generations.get(userId) ?? null,
  setAccountSyncGeneration: (userId: string, generation: number) => {
    mocks.generations.set(userId, generation);
  },
  accountSyncResetRequired: (userId: string) => mocks.resetRequired.has(userId),
  markAccountSyncResetRequired: (userId: string, generation: number) => {
    mocks.generations.set(userId, generation);
    mocks.resetRequired.add(userId);
  },
  clearAccountSyncResetRequired: (userId: string) => {
    mocks.resetRequired.delete(userId);
  },
}));

vi.mock("@/lib/analytics/events", () => ({
  track: mocks.track,
  setAnalyticsConsent: vi.fn(),
}));

// Exercise the dormant sync implementation independently of containment.
vi.mock("@/lib/sync/containment", () => ({
  ACCOUNT_SYNC_CONTAINED: false,
  accountSyncAvailable: (configured: boolean) => configured,
}));

import {
  filterByTombstones,
  isMissingBibleSyncColumn,
  isMissingRecentVersesTable,
  mergeSnapshots,
  retrySync,
  serverAuthoritativeBaseline,
  startSync,
  stopSync,
} from "@/lib/sync/engine";
import {
  clearLastSyncedUserId,
  getLastSyncedUserId,
  initialSyncIsPending,
  localJourneyClaimIsPending,
  setLastSyncedUserId,
} from "@/lib/sync/last-user";
import { prepareLocalJourneyHandoff } from "@/lib/sync/handoff";
import { useQuestOS } from "@/lib/questos/store";
import { useSyncStatus } from "@/lib/sync/status";

const OK = { data: null, error: null };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeClient(
  waitFor?: Promise<void>,
  onUpsert?: (
    table: string,
    rows: unknown,
    options: unknown,
  ) => Promise<{ data: unknown; error: unknown }>,
  onSelect?: (
    table: string,
  ) => Promise<{ data: unknown; error: unknown }>,
  onInsert?: (
    table: string,
    rows: unknown,
  ) => Promise<{ data: unknown; error: unknown }>,
  onRpc?: (
    name: string,
    args: Record<string, unknown> | undefined,
  ) => Promise<{ data: unknown; error: unknown } | undefined>,
  onMaybeSingle?: (
    table: string,
  ) => Promise<{ data: unknown; error: unknown } | undefined>,
): SupabaseClient {
  const ready = waitFor ?? Promise.resolve();
  const from = (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      delete: () => query,
      in: async () => OK,
      lt: async () => OK,
      match: async () => OK,
      maybeSingle: async () => {
        await ready;
        const custom = await onMaybeSingle?.(table);
        if (custom) return custom;
        if (table === "user_sync_state") {
          return { data: { generation: 0 }, error: null };
        }
        return OK;
      },
      upsert: async (rows: unknown, options?: unknown) =>
        onUpsert ? onUpsert(table, rows, options) : OK,
      insert: async (rows: unknown) =>
        onInsert ? onInsert(table, rows) : OK,
      then: (
        resolve: (value: { data: unknown; error: unknown }) => unknown,
        reject?: (reason: unknown) => unknown
      ) =>
        ready
          .then(() => (onSelect ? onSelect(table) : { data: [], error: null }))
          .then(resolve, reject),
    };
    return query;
  };
  return {
    from,
    // Existing engine fixtures emulate a cached schema so assignment pushes
    // exercise the rollout-compatible legacy path unless a test opts in.
    rpc: async (name: string, args?: Record<string, unknown>) => {
      const custom = await onRpc?.(name, args);
      if (custom) return custom;
      if (name === "daily_quest_sync_contract") {
        return {
          data: { contract: "biblequest_daily_quest_sync_v1", ok: true },
          error: null,
        };
      }
      if (name === "account_sync_contract") {
        return {
          data: { contract: "biblequest_account_sync_v3", ok: true },
          error: null,
        };
      }
      if (name === "account_sync_generation") {
        return { data: { generation: 0 }, error: null };
      }
      if (name === "upsert_mutable_account_rows") {
        const rows = Array.isArray(args?.p_rows) ? args.p_rows : [];
        return {
          data: {
            applied: rows.length,
            stale: 0,
            generation: args?.p_expected_generation ?? 0,
          },
          error: null,
        };
      }
      if (name === "replace_user_daily_quests") {
        return {
          data: {
            status: "applied",
            revision: 1,
            duplicate: false,
            rows: Array.isArray(args?.p_rows) ? args.p_rows : [],
            generation: args?.p_expected_generation ?? 0,
          },
          error: null,
        };
      }
      return OK;
    },
  } as unknown as SupabaseClient;
}

describe("sync ownership, lifecycle, and merge safety", () => {
  beforeEach(() => {
    stopSync();
    clearLastSyncedUserId();
    useQuestOS.getState().clearAllData();
    useSyncStatus.setState({ state: "off", lastSyncedAt: null });
    mocks.createClient.mockReset();
    mocks.generations.clear();
    mocks.resetRequired.clear();
  });

  it("refuses an automatic handoff to a different user", async () => {
    setLastSyncedUserId("account-a");

    await startSync("account-b");

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(useSyncStatus.getState().state).toBe("off");
    expect(getLastSyncedUserId()).toBe("account-a");
  });

  it("preserves the journey after an explicit keep-this-journey handoff", async () => {
    const snapshot = currentSnapshot();
    useQuestOS.getState().importData(snapshot);
    setLastSyncedUserId("account-a");
    prepareLocalJourneyHandoff("account-b", false);
    mocks.createClient.mockReturnValue(fakeClient());

    await startSync("account-b");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(useQuestOS.getState().profile?.displayName).toBe(
      snapshot.profile?.displayName,
    );
    expect(useQuestOS.getState().prayers).toEqual(snapshot.prayers);
    expect(localJourneyClaimIsPending("account-b")).toBe(false);
  });

  it("clears the other journey after an explicit start-fresh handoff", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    setLastSyncedUserId("account-a");
    prepareLocalJourneyHandoff("account-b", true);
    mocks.createClient.mockReturnValue(fakeClient());

    await startSync("account-b");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(useQuestOS.getState().profile).toBeNull();
    expect(useQuestOS.getState().prayers).toEqual([]);
    expect(localJourneyClaimIsPending("account-b")).toBe(false);
  });

  it("downgrades only the two additive Bible columns during migration rollout", () => {
    expect(
      isMissingBibleSyncColumn(
        {
          code: "PGRST204",
          message:
            "Could not find the 'preferred_bible_translation' column in the schema cache",
        },
        "preferred_bible_translation",
      ),
    ).toBe(true);
    expect(
      isMissingBibleSyncColumn(
        { code: "42703", message: "column translation_key does not exist" },
        "translation_key",
      ),
    ).toBe(true);
    expect(
      isMissingBibleSyncColumn(
        { code: "42501", message: "permission denied for user_settings" },
        "preferred_bible_translation",
      ),
    ).toBe(false);
    expect(
      isMissingBibleSyncColumn(
        { code: "PGRST100", message: "translation_key query is malformed" },
        "translation_key",
      ),
    ).toBe(false);
  });

  it("recognizes only the exact additive recent-verse table as optional", () => {
    expect(
      isMissingRecentVersesTable({
        code: "PGRST205",
        message:
          "Could not find the table 'public.user_recent_verses' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingRecentVersesTable({
        code: "42P01",
        message: 'relation "public.user_recent_verses" does not exist',
      }),
    ).toBe(true);
    expect(
      isMissingRecentVersesTable({
        code: "42501",
        message: "permission denied for table user_recent_verses",
      }),
    ).toBe(false);
    expect(
      isMissingRecentVersesTable({
        code: "PGRST205",
        message: "Could not find public.user_recent_verses_archive",
      }),
    ).toBe(false);
  });

  it("keeps core sync available while the additive recent-verse table is absent", async () => {
    const snapshot = currentSnapshot();
    snapshot.recentVerses = [
      {
        bookSlug: "john",
        bookName: "John",
        chapter: 1,
        verseStart: 1,
        verseEnd: 1,
        reference: "John 1:1",
        text: "Fixture verse",
        viewedAt: "2026-07-18T12:00:00.000Z",
      },
    ];
    useQuestOS.getState().importData(snapshot);

    const missingRecentVerses = {
      data: null,
      error: {
        code: "PGRST205",
        message:
          "Could not find the table 'public.user_recent_verses' in the schema cache",
      },
    };
    const attempts: string[] = [];
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        async (table) => {
          if (table !== "user_recent_verses") return OK;
          attempts.push("push");
          return missingRecentVerses;
        },
        async (table) => {
          if (table !== "user_recent_verses") {
            return { data: [], error: null };
          }
          attempts.push("pull");
          return missingRecentVerses;
        },
      ),
    );

    await startSync("account-a");

    expect(attempts).toEqual(["pull", "push"]);
    expect(useSyncStatus.getState()).toMatchObject({
      state: "idle",
      initialSyncComplete: true,
    });
    expect(useQuestOS.getState().recentVerses).toEqual(snapshot.recentVerses);
  });

  it("does not use the pre-0010 assignment fallback after v3 preflight", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    const inserted: Array<Array<Record<string, unknown>>> = [];
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        undefined,
        async (table, rows) => {
          if (table !== "user_daily_quests") return OK;
          const batch = rows as Array<Record<string, unknown>>;
          inserted.push(batch);
          if (inserted.length === 1) {
            return {
              data: null,
              error: {
                code: "PGRST204",
                message:
                  "Could not find the 'picked_at' column of 'user_daily_quests' in the schema cache",
              },
            };
          }
          return OK;
        },
      ),
    );

    await startSync("account-a");

    expect(inserted).toEqual([]);
    expect(useSyncStatus.getState().state).toBe("idle");
  });

  it("still fails closed when the recent-verse table returns a policy error", async () => {
    mocks.createClient.mockReturnValue(
      fakeClient(undefined, undefined, async (table) =>
        table === "user_recent_verses"
          ? {
              data: null,
              error: {
                code: "42501",
                message: "permission denied for table user_recent_verses",
              },
            }
          : { data: [], error: null },
      ),
    );

    await startSync("account-a");

    expect(useSyncStatus.getState()).toMatchObject({
      state: "error",
      initialSyncComplete: false,
    });
    expect(getLastSyncedUserId()).toBeNull();
  });

  it("allows the same user to stop and restart sync", async () => {
    setLastSyncedUserId("account-a");
    mocks.createClient
      .mockReturnValueOnce(fakeClient())
      .mockReturnValueOnce(fakeClient());

    await startSync("account-a");
    expect(useSyncStatus.getState().state).toBe("idle");
    stopSync();
    await startSync("account-a");

    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(useSyncStatus.getState().state).toBe("idle");
    expect(useSyncStatus.getState()).toMatchObject({
      userId: "account-a",
      initialSyncComplete: true,
    });
  });

  it("deduplicates edition bookmarks when rolling back to the pre-0011 schema", async () => {
    const snapshot = currentSnapshot();
    snapshot.bookmarks = [
      { ...snapshot.bookmarks[0], id: "bookmark-web", translationKey: "web" },
      {
        ...snapshot.bookmarks[0],
        id: "bookmark-niv",
        translationKey: "niv",
        createdAt: "2026-07-18T12:00:00.000Z",
      },
    ];
    useQuestOS.getState().importData(snapshot);

    const legacyBatches: unknown[][] = [];
    mocks.createClient.mockReturnValue(
      fakeClient(undefined, async (table, rows, options) => {
        if (table !== "verse_bookmarks") return OK;
        const conflict = (options as { onConflict?: string } | undefined)
          ?.onConflict;
        if (conflict?.includes("translation_key")) {
          return {
            data: null,
            error: {
              code: "PGRST204",
              message: "Could not find the 'translation_key' column",
            },
          };
        }
        legacyBatches.push(rows as unknown[]);
        return OK;
      }),
    );

    await startSync("account-a");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(legacyBatches).toHaveLength(1);
    expect(legacyBatches[0]).toHaveLength(1);
    expect(legacyBatches[0][0]).not.toHaveProperty("translation_key");
  });

  it("deliberately retries a failed initial sync for the same user", async () => {
    mocks.createClient
      .mockImplementationOnce(() => {
        throw new Error("offline");
      })
      .mockReturnValueOnce(fakeClient());

    await startSync("account-a");
    expect(useSyncStatus.getState()).toMatchObject({
      state: "error",
      userId: "account-a",
      initialSyncComplete: false,
    });
    expect(initialSyncIsPending("account-a")).toBe(true);

    await retrySync("account-a");
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(mocks.track).toHaveBeenCalledTimes(2);
    expect(mocks.track).toHaveBeenCalledWith("sync_failed", {
      status: "initial",
    });
    expect(useSyncStatus.getState()).toMatchObject({
      state: "idle",
      userId: "account-a",
      initialSyncComplete: true,
    });
    expect(initialSyncIsPending("account-a")).toBe(false);
  });

  it("keeps first-account adoption pending when its initial push fails", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    mocks.createClient.mockReturnValue(
      fakeClient(undefined, async (table) =>
        table === "verse_bookmarks"
          ? {
              data: null,
              error: { code: "503", message: "fixture push unavailable" },
            }
          : OK,
      ),
    );

    await startSync("account-a");

    expect(getLastSyncedUserId()).toBe("account-a");
    expect(initialSyncIsPending("account-a")).toBe(true);
    expect(useSyncStatus.getState()).toMatchObject({
      state: "error",
      initialSyncComplete: false,
    });
  });

  it("routes mutable account rows through the guarded RPC in bounded batches", async () => {
    const snapshot = currentSnapshot();
    snapshot.prayers = Array.from({ length: 201 }, (_, index) => ({
      ...snapshot.prayers[0],
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    useQuestOS.getState().importData(snapshot);
    const mutableBatches: Array<{ resource: unknown; size: number }> = [];
    const directMutableUpserts: string[] = [];
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        async (table) => {
          if (
            [
              "profiles",
              "user_settings",
              "notification_preferences",
              "prayers",
              "reflections",
              "user_quests",
              "reading_progress",
            ].includes(table)
          ) {
            directMutableUpserts.push(table);
          }
          return OK;
        },
        undefined,
        undefined,
        async (name, args) => {
          if (name !== "upsert_mutable_account_rows") return undefined;
          const rows = Array.isArray(args?.p_rows) ? args.p_rows : [];
          mutableBatches.push({ resource: args?.p_resource, size: rows.length });
          return {
            data: {
              applied: rows.length,
              stale: 0,
              generation: args?.p_expected_generation ?? 0,
            },
            error: null,
          };
        },
      ),
    );

    await startSync("account-a");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(directMutableUpserts).toEqual([]);
    expect(mutableBatches).toEqual(
      expect.arrayContaining([
        { resource: "profiles", size: 1 },
        { resource: "user_settings", size: 1 },
        { resource: "notification_preferences", size: 1 },
        { resource: "prayers", size: 200 },
        { resource: "prayers", size: 1 },
        { resource: "reflections", size: 1 },
        { resource: "user_quests", size: 1 },
        { resource: "reading_progress", size: 1 },
      ]),
    );
  });

  it("serializes provider writes and stops before later tables after failure", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    const directWrites: string[] = [];
    const mutableWrites: unknown[] = [];
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        async (table) => {
          directWrites.push(table);
          return OK;
        },
        undefined,
        undefined,
        async (name, args) => {
          if (name !== "upsert_mutable_account_rows") return undefined;
          mutableWrites.push(args?.p_resource);
          if (args?.p_resource === "user_quests") {
            return { data: null, error: { code: "503", message: "unavailable" } };
          }
          const rows = Array.isArray(args?.p_rows) ? args.p_rows : [];
          return {
            data: {
              applied: rows.length,
              stale: 0,
              generation: args?.p_expected_generation ?? 0,
            },
            error: null,
          };
        },
      ),
    );

    await startSync("account-a");

    expect(useSyncStatus.getState().state).toBe("error");
    expect(mutableWrites).toContain("user_quests");
    expect(directWrites).not.toContain("quest_completions");
    expect(directWrites).not.toContain("journey_events");
  });

  it("pushes an edit made while the initial account write is in flight", async () => {
    vi.useFakeTimers();
    try {
      useQuestOS.getState().importData(currentSnapshot());
      const firstProfileStarted = deferred();
      const releaseFirstProfile = deferred();
      const profileNames: unknown[] = [];
      let profileWrites = 0;
      mocks.createClient.mockReturnValue(
        fakeClient(
          undefined,
          undefined,
          undefined,
          undefined,
          async (name, args) => {
            if (
              name !== "upsert_mutable_account_rows" ||
              args?.p_resource !== "profiles"
            ) {
              return undefined;
            }
            profileWrites += 1;
            const rows = Array.isArray(args.p_rows) ? args.p_rows : [];
            profileNames.push((rows[0] as { display_name?: unknown })?.display_name);
            if (profileWrites === 1) {
              firstProfileStarted.resolve();
              await releaseFirstProfile.promise;
            }
            return {
              data: {
                applied: rows.length,
                stale: 0,
                generation: args?.p_expected_generation ?? 0,
              },
              error: null,
            };
          },
        ),
      );

      const starting = startSync("account-a");
      await firstProfileStarted.promise;
      useQuestOS.getState().updateProfile({ displayName: "Edited in flight" });
      releaseFirstProfile.resolve();
      await starting;
      await vi.advanceTimersByTimeAsync(2_500);

      expect(profileNames).toEqual([
        currentSnapshot().profile?.displayName,
        "Edited in flight",
      ]);
    } finally {
      stopSync();
      vi.useRealTimers();
    }
  });

  it("fails the initial sync closed when the account copy wins a timestamp race", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        undefined,
        undefined,
        async (name, args) =>
          name === "upsert_mutable_account_rows" &&
          args?.p_resource === "profiles"
            ? {
                data: {
                  applied: 0,
                  stale: 1,
                  generation: args?.p_expected_generation ?? 0,
                },
                error: null,
              }
            : undefined,
      ),
    );

    await startSync("account-a");

    expect(useSyncStatus.getState()).toMatchObject({
      state: "error",
      initialSyncComplete: false,
    });
    expect(initialSyncIsPending("account-a")).toBe(true);
    expect(mocks.track).toHaveBeenCalledWith("sync_failed", {
      status: "initial",
    });
  });

  it("recovers a write-through timestamp conflict with a full reconciliation", async () => {
    vi.useFakeTimers();
    try {
      useQuestOS.getState().importData(currentSnapshot());
      let profileWrites = 0;
      const client = fakeClient(
        undefined,
        undefined,
        undefined,
        undefined,
        async (name, args) => {
          if (
            name !== "upsert_mutable_account_rows" ||
            args?.p_resource !== "profiles"
          ) {
            return undefined;
          }
          profileWrites += 1;
          return profileWrites === 2
            ? {
                data: {
                  applied: 0,
                  stale: 1,
                  generation: args?.p_expected_generation ?? 0,
                },
                error: null,
              }
            : {
                data: {
                  applied: 1,
                  stale: 0,
                  generation: args?.p_expected_generation ?? 0,
                },
                error: null,
              };
        },
      );
      mocks.createClient.mockReturnValue(client);

      await startSync("account-a");
      useQuestOS.getState().updateProfile({ displayName: "Changed locally" });
      await vi.advanceTimersByTimeAsync(2_500);

      expect(useSyncStatus.getState()).toMatchObject({
        state: "error",
        initialSyncComplete: true,
      });
      await vi.advanceTimersByTimeAsync(30_000);

      expect(mocks.createClient).toHaveBeenCalledTimes(3);
      expect(useSyncStatus.getState()).toMatchObject({
        state: "idle",
        initialSyncComplete: true,
      });
      expect(profileWrites).toBe(3);
    } finally {
      stopSync();
      vi.useRealTimers();
    }
  });

  it("invalidates a stale in-flight initial sync after a restart", async () => {
    const firstPull = deferred();
    mocks.createClient
      .mockReturnValueOnce(fakeClient(firstPull.promise))
      .mockReturnValueOnce(fakeClient());

    const staleRun = startSync("account-a");
    await vi.waitFor(() => expect(mocks.createClient).toHaveBeenCalledTimes(1));
    stopSync();
    await startSync("account-b");
    expect(getLastSyncedUserId()).toBe("account-b");

    firstPull.resolve();
    await staleRun;

    expect(getLastSyncedUserId()).toBe("account-b");
    expect(useSyncStatus.getState().state).toBe("idle");
  });

  it("replaces stale local account fields after a generation advance", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    setLastSyncedUserId("account-a");
    mocks.generations.set("account-a", 0);
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        undefined,
        undefined,
        async (name) =>
          name === "account_sync_generation"
            ? { data: { generation: 1 }, error: null }
            : undefined,
      ),
    );

    await startSync("account-a");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(useQuestOS.getState().profile).toBeNull();
    expect(useQuestOS.getState().prayers).toEqual([]);
    expect(mocks.generations.get("account-a")).toBe(1);
  });

  it("recovers a response-lost deletion without discarding current local data", async () => {
    const snapshot = currentSnapshot();
    useQuestOS.getState().importData(snapshot);
    useQuestOS.getState().deletePrayer(snapshot.prayers[0].id);
    setLastSyncedUserId("account-a");
    mocks.generations.set("account-a", 0);
    const deletionGenerations: unknown[] = [];
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        undefined,
        undefined,
        async (name, args) => {
          if (name === "account_sync_generation") {
            return { data: { generation: 1 }, error: null };
          }
          if (name !== "delete_user_sync_rows") return undefined;
          deletionGenerations.push(args?.p_expected_generation);
          return {
            data: { deleted: 0, generation: 1, duplicate: true },
            error: null,
          };
        },
      ),
    );

    await startSync("account-a");

    expect(deletionGenerations).toEqual([0]);
    expect(useQuestOS.getState().profile?.displayName).toBe(
      snapshot.profile?.displayName,
    );
    expect(useQuestOS.getState().prayers).toEqual([]);
    expect(useQuestOS.getState().tombstones.prayers).toEqual([]);
  });

  it("applies a stale device deletion but resets its other account fields", async () => {
    const snapshot = currentSnapshot();
    snapshot.prayers.push({
      ...snapshot.prayers[0],
      id: "00000000-0000-4000-8000-000000000109",
      body: "stale remaining prayer",
    });
    useQuestOS.getState().importData(snapshot);
    useQuestOS.getState().deletePrayer(snapshot.prayers[0].id);
    setLastSyncedUserId("account-a");
    mocks.generations.set("account-a", 0);
    let liveGeneration = 2;
    const deletionGenerations: unknown[] = [];
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        undefined,
        undefined,
        async (name, args) => {
          if (name === "account_sync_generation") {
            return { data: { generation: liveGeneration }, error: null };
          }
          if (name !== "delete_user_sync_rows") return undefined;
          const expected = args?.p_expected_generation;
          deletionGenerations.push(expected);
          if (expected === 0) {
            return {
              data: null,
              error: { code: "40001", message: "stale generation" },
            };
          }
          liveGeneration = 3;
          return {
            data: { deleted: 1, generation: 3, duplicate: false },
            error: null,
          };
        },
      ),
    );

    await startSync("account-a");

    expect(deletionGenerations).toEqual([0, 2]);
    expect(useQuestOS.getState().profile).toBeNull();
    expect(useQuestOS.getState().prayers).toEqual([]);
    expect(mocks.generations.get("account-a")).toBe(3);
    expect(mocks.resetRequired.has("account-a")).toBe(false);
  });

  it("quarantines a generation advance between pull verification and push", async () => {
    vi.useFakeTimers();
    try {
      const snapshot = currentSnapshot();
      useQuestOS.getState().importData(snapshot);
      setLastSyncedUserId("account-a");
      mocks.generations.set("account-a", 0);
      let liveGeneration = 0;
      let injectConflict = true;
      mocks.createClient.mockReturnValue(
        fakeClient(
          undefined,
          undefined,
          undefined,
          undefined,
          async (name, args) => {
            if (name === "account_sync_generation") {
              return { data: { generation: liveGeneration }, error: null };
            }
            if (
              name === "upsert_mutable_account_rows" &&
              injectConflict
            ) {
              injectConflict = false;
              liveGeneration = 1;
              return {
                data: null,
                error: { code: "40001", message: "stale generation" },
              };
            }
            if (name === "upsert_mutable_account_rows") {
              const rows = Array.isArray(args?.p_rows) ? args.p_rows : [];
              return {
                data: {
                  applied: rows.length,
                  stale: 0,
                  generation: args?.p_expected_generation ?? 0,
                },
                error: null,
              };
            }
            return undefined;
          },
        ),
      );

      await startSync("account-a");

      expect(useSyncStatus.getState()).toMatchObject({
        state: "error",
        initialSyncComplete: false,
      });
      expect(initialSyncIsPending("account-a")).toBe(true);
      expect(mocks.resetRequired.has("account-a")).toBe(true);
      expect(useQuestOS.getState().profile?.displayName).toBe(
        snapshot.profile?.displayName,
      );

      await vi.advanceTimersByTimeAsync(1);

      expect(useSyncStatus.getState()).toMatchObject({
        state: "idle",
        initialSyncComplete: true,
      });
      expect(useQuestOS.getState().profile).toBeNull();
      expect(initialSyncIsPending("account-a")).toBe(false);
      expect(mocks.resetRequired.has("account-a")).toBe(false);
    } finally {
      stopSync();
      vi.useRealTimers();
    }
  });

  it("lets local tombstones win over remote resurrection", () => {
    const remote = currentSnapshot();
    const tombstones = {
      ...emptyTombstones(),
      prayers: [remote.prayers[0].id],
      reflections: [remote.reflections[0].id],
      bookmarks: [{ bookSlug: "fixture-book", chapter: 1, verse: 1 }],
      myQuests: ["fixture-walk"],
    };

    const filtered = filterByTombstones(remote, tombstones);
    const merged = mergeSnapshots(emptySnapshot(), filtered);

    expect(merged.prayers.length).toBe(0);
    expect(merged.reflections.length).toBe(0);
    expect(merged.bookmarks.length).toBe(0);
    expect(Object.keys(merged.myQuests ?? {}).length).toBe(0);
  });

  it("builds a server baseline without erasing device-local preferences", () => {
    const local = currentSnapshot();
    local.settings.appearance.wallpaperId = "the-olive-grove";

    const baseline = serverAuthoritativeBaseline(local);

    expect(baseline.profile).toBeNull();
    expect(baseline.prayers).toEqual([]);
    expect(baseline.myQuests).toEqual({});
    expect(baseline.settings.appearance.wallpaperId).toBe("the-olive-grove");
    expect(baseline.streak).toEqual(local.streak);
    expect(baseline.accountNudge).toEqual(local.accountNudge);
  });

  it("uses account timestamps for profile and settings while preserving device appearance", () => {
    const local = currentSnapshot();
    local.profile = {
      ...local.profile!,
      displayName: "Local older profile",
      updatedAt: "2026-07-22T19:00:00.000Z",
    };
    local.settings = {
      ...local.settings,
      analyticsConsent: true,
      language: "en",
      updatedAt: "2026-07-22T19:00:00.000Z",
      notificationsUpdatedAt: "2026-07-22T21:00:00.000Z",
      notifications: {
        ...local.settings.notifications,
        dailyVerse: true,
      },
      appearance: {
        ...local.settings.appearance,
        boldText: true,
        wallpaperId: "the-olive-grove",
      },
    };
    const remote = currentSnapshot();
    remote.profile = {
      ...remote.profile!,
      displayName: "Remote newer profile",
      updatedAt: "2026-07-22T20:00:00.000Z",
    };
    remote.settings = {
      ...remote.settings,
      analyticsConsent: true,
      language: "es",
      updatedAt: "2026-07-22T20:00:00.000Z",
      notificationsUpdatedAt: "2026-07-22T18:00:00.000Z",
      notifications: {
        ...remote.settings.notifications,
        dailyVerse: false,
      },
      appearance: {
        ...remote.settings.appearance,
        boldText: false,
        wallpaperId: "candlelit-scriptorium",
      },
    };

    const merged = mergeSnapshots(local, remote);

    expect(merged.profile?.displayName).toBe("Remote newer profile");
    expect(merged.settings.language).toBe("es");
    expect(merged.settings.updatedAt).toBe("2026-07-22T20:00:00.000Z");
    expect(merged.settings.notifications.dailyVerse).toBe(true);
    expect(merged.settings.notificationsUpdatedAt).toBe(
      "2026-07-22T21:00:00.000Z",
    );
    expect(merged.settings.appearance.boldText).toBe(true);
    expect(merged.settings.appearance.wallpaperId).toBe("the-olive-grove");
    expect(merged.settings.analyticsConsent).toBe(true);
  });

  it("keeps newer local account fields but requires consent on both devices", () => {
    const local = currentSnapshot();
    local.profile = {
      ...local.profile!,
      displayName: "Local newer profile",
      updatedAt: "2026-07-22T21:00:00.000Z",
    };
    local.settings = {
      ...local.settings,
      analyticsConsent: true,
      language: "en",
      updatedAt: "2026-07-22T21:00:00.000Z",
    };
    const remote = currentSnapshot();
    remote.profile = {
      ...remote.profile!,
      displayName: "Remote older profile",
      updatedAt: "2026-07-22T20:00:00.000Z",
    };
    remote.settings = {
      ...remote.settings,
      analyticsConsent: false,
      language: "es",
      updatedAt: "2026-07-22T20:00:00.000Z",
    };

    const merged = mergeSnapshots(local, remote);

    expect(merged.profile?.displayName).toBe("Local newer profile");
    expect(merged.settings.language).toBe("en");
    expect(merged.settings.analyticsConsent).toBe(false);
  });

  it("does not let an absent remote notification row erase local choices", () => {
    const local = currentSnapshot();
    local.settings = {
      ...local.settings,
      updatedAt: "2026-07-22T19:00:00.000Z",
      notificationsUpdatedAt: "2026-07-22T20:00:00.000Z",
      notifications: {
        ...local.settings.notifications,
        dailyVerse: true,
      },
    };
    const remote = {
      settings: {
        ...local.settings,
        updatedAt: "2026-07-22T21:00:00.000Z",
        notificationsUpdatedAt: undefined,
        notifications: DEFAULT_SETTINGS.notifications,
      },
      notificationPreferencesPresent: false,
    };

    const merged = mergeSnapshots(local, remote);

    expect(merged.settings.notifications.dailyVerse).toBe(true);
    expect(merged.settings.notificationsUpdatedAt).toBe(
      "2026-07-22T20:00:00.000Z",
    );
  });

  it("timestamps base settings, notifications, and device art independently", () => {
    vi.useFakeTimers();
    try {
      const snapshot = currentSnapshot();
      snapshot.settings.updatedAt = "2026-07-22T18:00:00.000Z";
      snapshot.settings.notificationsUpdatedAt = "2026-07-22T18:30:00.000Z";
      useQuestOS.getState().importData(snapshot);

      vi.setSystemTime(new Date("2026-07-22T19:00:00.000Z"));
      useQuestOS.getState().updateSettings({
        appearance: {
          ...snapshot.settings.appearance,
          wallpaperId: "the-olive-grove",
        },
      });
      expect(useQuestOS.getState().settings).toMatchObject({
        updatedAt: "2026-07-22T18:00:00.000Z",
        notificationsUpdatedAt: "2026-07-22T18:30:00.000Z",
      });

      vi.setSystemTime(new Date("2026-07-22T20:00:00.000Z"));
      useQuestOS.getState().updateSettings({ language: "es" });
      expect(useQuestOS.getState().settings).toMatchObject({
        updatedAt: "2026-07-22T20:00:00.000Z",
        notificationsUpdatedAt: "2026-07-22T18:30:00.000Z",
      });

      vi.setSystemTime(new Date("2026-07-22T21:00:00.000Z"));
      useQuestOS.getState().updateSettings({
        notifications: {
          ...useQuestOS.getState().settings.notifications,
          dailyQuest: true,
        },
      });
      expect(useQuestOS.getState().settings).toMatchObject({
        updatedAt: "2026-07-22T20:00:00.000Z",
        notificationsUpdatedAt: "2026-07-22T21:00:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("merges recent verses by passage, keeps the newest visit, and caps at twenty", () => {
    const local = currentSnapshot();
    local.recentVerses = Array.from({ length: 20 }, (_, index) => ({
      bookSlug: "john",
      bookName: "John",
      chapter: 1,
      verseStart: index + 1,
      verseEnd: index + 1,
      reference: `John 1:${index + 1}`,
      text: `Local ${index + 1}`,
      viewedAt: `2026-07-16T12:${String(index).padStart(2, "0")}:00.000Z`,
    }));
    const remote = emptySnapshot();
    remote.recentVerses = [
      {
        ...local.recentVerses[19],
        text: "Older remote duplicate",
        viewedAt: "2026-07-16T11:00:00.000Z",
      },
      {
        bookSlug: "romans",
        bookName: "Romans",
        chapter: 8,
        verseStart: 1,
        verseEnd: 1,
        reference: "Romans 8:1",
        text: "Remote newest",
        viewedAt: "2026-07-16T13:00:00.000Z",
      },
    ];

    const merged = mergeSnapshots(local, remote);
    expect(merged.recentVerses).toHaveLength(20);
    expect(merged.recentVerses?.[0].reference).toBe("Romans 8:1");
    expect(merged.recentVerses?.find((verse) => verse.reference === "John 1:20")?.text)
      .toBe("Local 20");
  });
});
