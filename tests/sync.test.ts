import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS, emptyTombstones } from "@/lib/questos/types";
import { currentSnapshot, emptySnapshot } from "./fixtures";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  track: vi.fn(),
  generations: new Map<string, number>(),
  resetRequired: new Set<string>(),
  commitHandoffOwner: vi.fn(),
}));

// Committing the private handoff owner is the cutover engine's contract and is
// covered by its own suite. Stub only that call so these tests keep exercising
// sync ownership and merge safety rather than re-deriving a cutover fixture.
vi.mock("@/lib/storage/web-private-cutover", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  commitWebPrivateHandoffOwner: mocks.commitHandoffOwner,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
  createSyncControlClient: () => mocks.createClient(),
  createSyncClient: () => mocks.createClient.mock.results.at(-1)?.value,
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/sync/generation", () => ({
  getAccountSyncGeneration: (userId: string) => mocks.generations.get(userId) ?? null,
  setAccountSyncGeneration: (userId: string, generation: number) => {
    mocks.generations.set(userId, generation);
    return true;
  },
  accountSyncResetRequired: (userId: string) => mocks.resetRequired.has(userId),
  markAccountSyncResetRequired: (userId: string, generation: number) => {
    mocks.generations.set(userId, generation);
    mocks.resetRequired.add(userId);
    return true;
  },
  clearAccountSyncResetRequired: (userId: string) => {
    mocks.resetRequired.delete(userId);
    return true;
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
import { SYNC_REQUEST_DEADLINE_MS } from "@/lib/sync/request";
import {
  clearLastSyncedUserId,
  getLastSyncedUserId,
  initialSyncIsPending,
  localJourneyClaimIsPending,
  markInitialSyncPending,
  markLocalJourneyClaimPending,
  setLastSyncedUserId,
} from "@/lib/sync/last-user";
import { prepareLocalJourneyHandoff } from "@/lib/sync/handoff";
import { seedWebAuthEnvelope } from "./fixtures/web-auth";
import {
  withActiveWebPrivateWriteReset,
  withWebAccountOperationLock,
} from "@/lib/supabase/web-auth-storage";
import {
  LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
  LEGACY_QUEST_JOURNEY_STORAGE_KEY,
  WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
  WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
} from "@/lib/storage/web-private-namespace";
import { useQuestOS } from "@/lib/questos/store";
import { useSyncStatus } from "@/lib/sync/status";
import {
  assignmentToRow,
  bookmarkToRow,
  prayerToRow,
  profileToRow,
  settingsToRows,
} from "@/lib/sync/mapping";

const OK = { data: null, error: null };

/**
 * Applies a handoff through the same shape SyncManager uses on the web: an
 * account-operation handle for every handoff, and a private write reset scope
 * around the destructive start-fresh purge. Without that scope the reviewed
 * removal authority is absent and the purge refuses, so a test that skipped it
 * would assert against a failure it created itself.
 */
async function handoff(userId: string, startFresh: boolean): Promise<void> {
  seedWebAuthEnvelope(userId);
  await withWebAccountOperationLock(async (handle) => {
    if (!startFresh) {
      await prepareLocalJourneyHandoff(userId, false, undefined, handle);
      return;
    }
    await withActiveWebPrivateWriteReset(handle, userId, async () => {
      await prepareLocalJourneyHandoff(userId, true, undefined, handle);
      return true;
    });
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Add the v4 server revision column to mutable rows returned by fixtures. */
function revisionedSelection(table: string, data: unknown): unknown {
  const mutable = new Set([
    "profiles",
    "user_settings",
    "notification_preferences",
    "prayers",
    "reflections",
    "user_quests",
    "reading_progress",
    "verse_bookmarks",
    "user_recent_verses",
  ]);
  if (!mutable.has(table) || data == null) return data;
  const revisionedRow = (row: object) => ({
    ...row,
    sync_revision: 0,
    ...(table === "user_recent_verses" &&
    !Object.hasOwn(row, "server_seen_at")
      ? { server_seen_at: "2026-07-22T12:00:00.000Z" }
      : {}),
  });
  if (Array.isArray(data)) {
    return data.map((row) => revisionedRow(row as object));
  }
  return revisionedRow(data as object);
}

/** Derive the exact attributable key returned by the v4 mutable RPC. */
function mutableResultKey(
  resource: unknown,
  envelope: unknown,
  userId: unknown,
) {
  const row =
    envelope && typeof envelope === "object"
      ? ((envelope as { row?: Record<string, unknown> }).row ?? {})
      : {};
  switch (resource) {
    case "profiles":
      return { id: userId };
    case "user_settings":
    case "notification_preferences":
    case "reading_progress":
      return { user_id: userId };
    case "prayers":
    case "reflections":
      return { id: row.id };
    case "user_quests":
      return { quest_slug: row.quest_slug };
    case "verse_bookmarks":
      return {
        book_slug: row.book_slug,
        chapter: row.chapter,
        verse: row.verse,
        translation_key: row.translation_key,
      };
    default:
      return {
        book_slug: row.book_slug,
        chapter: row.chapter,
        verse_start: row.verse_start,
        verse_end: row.verse_end,
      };
  }
}

/** Upgrade legacy aggregate fixture acknowledgements into exact v4 results. */
function normalizeMutableFixtureResponse(
  args: Record<string, unknown> | undefined,
  response: { data: unknown; error: unknown },
) {
  if (response.error || !response.data || typeof response.data !== "object") {
    return response;
  }
  const aggregate = response.data as {
    applied?: unknown;
    generation?: unknown;
    stale?: unknown;
  };
  if (!Number.isInteger(aggregate.applied) || !Number.isInteger(aggregate.stale)) {
    return response;
  }
  const rows = Array.isArray(args?.p_rows) ? args.p_rows : [];
  return {
    data: {
      generation: aggregate.generation,
      results: rows.map((row, index) => ({
        key: mutableResultKey(args?.p_resource, row, args?.p_expected_user_id),
        revision:
          ((row as { expected_revision?: number }).expected_revision ?? 0) + 1,
        status: index < (aggregate.applied as number) ? "applied" : "conflict",
      })),
    },
    error: null,
  };
}

interface FakeSelectQuery {
  columns: string;
  equalities: Array<{ column: string; value: unknown }>;
  orders: Array<{ ascending: boolean; column: string }>;
  range: { from: number; to: number } | null;
}

/** Apply deterministic ordering and inclusive PostgREST ranges to fixtures. */
function applyFakeSelectQuery(
  data: unknown,
  query: FakeSelectQuery,
  rowCap?: number,
): unknown {
  if (!Array.isArray(data)) return data;
  const rows = [...data];
  rows.sort((left, right) => {
    const leftRow = left as Record<string, unknown>;
    const rightRow = right as Record<string, unknown>;
    for (const order of query.orders) {
      const leftValue = leftRow[order.column];
      const rightValue = rightRow[order.column];
      if (leftValue === rightValue) continue;
      const delta = String(leftValue).localeCompare(String(rightValue));
      return order.ascending ? delta : -delta;
    }
    return 0;
  });
  if (!query.range) return rows;
  const inclusiveEnd = rowCap
    ? Math.min(query.range.to, query.range.from + rowCap - 1)
    : query.range.to;
  return rows.slice(query.range.from, inclusiveEnd + 1);
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
    query: Readonly<FakeSelectQuery>,
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
  selectRowCap?: number,
): SupabaseClient {
  const ready = waitFor ?? Promise.resolve();
  const from = (table: string) => {
    const selection: FakeSelectQuery = {
      columns: "*",
      equalities: [],
      orders: [],
      range: null,
    };
    const query = {
      select: (columns = "*") => {
        selection.columns = columns;
        return query;
      },
      eq: (column: string, value: unknown) => {
        selection.equalities.push({ column, value });
        return query;
      },
      order: (
        column: string,
        options?: { ascending?: boolean },
      ) => {
        selection.orders.push({
          ascending: options?.ascending ?? true,
          column,
        });
        return query;
      },
      range: (from: number, to: number) => {
        selection.range = { from, to };
        return query;
      },
      delete: () => query,
      in: async () => OK,
      lt: async () => OK,
      match: async () => OK,
      maybeSingle: async () => {
        await ready;
        const custom = await onMaybeSingle?.(table);
        if (custom) {
          return { ...custom, data: revisionedSelection(table, custom.data) };
        }
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
          .then(() =>
            onSelect
              ? onSelect(table, selection)
              : { data: [], error: null },
          )
          .then((result) => ({
            ...result,
            data: revisionedSelection(
              table,
              applyFakeSelectQuery(result.data, selection, selectRowCap),
            ),
          }))
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
      if (custom) {
        return name === "upsert_mutable_account_rows"
          ? normalizeMutableFixtureResponse(args, custom)
          : custom;
      }
      if (name === "daily_quest_sync_contract") {
        return {
          data: { contract: "biblequest_daily_quest_sync_v1", ok: true },
          error: null,
        };
      }
      if (name === "account_sync_contract") {
        return {
          data: { contract: "biblequest_account_sync_v4", ok: true },
          error: null,
        };
      }
      if (name === "guided_progress_sync_contract") {
        return {
          data: {
            contract: "biblequest_guided_progress_sync_v1",
            ok: true,
          },
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
            generation: args?.p_expected_generation ?? 0,
            results: rows.map((row) => ({
              key: mutableResultKey(
                args?.p_resource,
                row,
                args?.p_expected_user_id,
              ),
              revision:
                ((row as { expected_revision?: number }).expected_revision ?? 0) +
                1,
              status: "applied",
            })),
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
  beforeEach(async () => {
    stopSync();
    await clearLastSyncedUserId();
    useQuestOS.getState().clearAllData();
    useSyncStatus.setState({ state: "off", lastSyncedAt: null });
    mocks.createClient.mockReset();
    mocks.generations.clear();
    mocks.resetRequired.clear();
    mocks.commitHandoffOwner.mockReset();
    // Reproduce the owner markers the real contract publishes, so the engine
    // still sees a genuine ownership change rather than a bare true.
    mocks.commitHandoffOwner.mockImplementation(
      async (
        _webOperation: unknown,
        userId: string,
        keepLocalJourney: boolean,
      ) => {
        if (keepLocalJourney) await markLocalJourneyClaimPending(userId);
        await markInitialSyncPending(userId);
        await setLastSyncedUserId(userId);
        return true;
      },
    );
  });

  it("refuses an automatic handoff to a different user", async () => {
    await setLastSyncedUserId("account-a");

    await startSync("account-b");

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(useSyncStatus.getState().state).toBe("off");
    expect(getLastSyncedUserId()).toBe("account-a");
  });

  it("preserves the journey after an explicit keep-this-journey handoff", async () => {
    const snapshot = currentSnapshot();
    useQuestOS.getState().importData(snapshot);
    await setLastSyncedUserId("account-a");
    await handoff("account-b", false);
    mocks.createClient.mockReturnValue(fakeClient());

    await startSync("account-b");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(useQuestOS.getState().profile?.displayName).toBe(
      snapshot.profile?.displayName,
    );
    expect(useQuestOS.getState().prayers).toEqual(snapshot.prayers);
    expect(localJourneyClaimIsPending("account-b")).toBe(false);
  });

  it("adopts an onboarded guest journey on the first account sign-in", async () => {
    const snapshot = currentSnapshot();
    useQuestOS.getState().importData(snapshot);
    mocks.createClient.mockReturnValue(fakeClient());

    await startSync("account-a");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(getLastSyncedUserId()).toBe("account-a");
    expect(useQuestOS.getState().profile?.displayName).toBe(
      snapshot.profile?.displayName,
    );
    expect(useQuestOS.getState().prayers).toEqual(snapshot.prayers);
    expect(useQuestOS.getState().reflections).toEqual(snapshot.reflections);
    expect(useQuestOS.getState().bookmarks).toEqual([
      { ...snapshot.bookmarks[0], translationKey: "web" },
    ]);
  });

  it("does not import remote rows when the mutable CAS baseline cannot persist", async () => {
    const local = currentSnapshot();
    local.profile = { ...local.profile!, displayName: "Local guest" };
    useQuestOS.getState().importData(local);
    const remoteProfile = {
      ...local.profile,
      displayName: "Remote account",
    };
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        async (table) =>
          table === "profiles"
            ? {
                data: profileToRow("account-a", remoteProfile),
                error: null,
              }
            : undefined,
      ),
    );
    const nativeSetItem = window.localStorage.setItem.bind(window.localStorage);
    const storageWrite = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation((key, value) => {
        if (key === "biblequest:mutable-account-cas:v1") {
          throw new Error("fixture storage unavailable");
        }
        nativeSetItem(key, value);
      });

    try {
      await startSync("account-a");

      expect(useSyncStatus.getState()).toMatchObject({
        state: "error",
        initialSyncComplete: false,
      });
      expect(useQuestOS.getState().profile?.displayName).toBe("Local guest");
      expect(initialSyncIsPending("account-a")).toBe(true);
    } finally {
      storageWrite.mockRestore();
      stopSync();
    }
  });

  it("does not import remote rows when the daily CAS baseline cannot persist", async () => {
    const local = currentSnapshot();
    local.profile = { ...local.profile!, displayName: "Local guest" };
    useQuestOS.getState().importData(local);
    const remoteProfile = {
      ...local.profile,
      displayName: "Remote account",
    };
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        async (table) =>
          table === "profiles"
            ? {
                data: profileToRow("account-a", remoteProfile),
                error: null,
              }
            : undefined,
      ),
    );
    const nativeSetItem = window.localStorage.setItem.bind(window.localStorage);
    const storageWrite = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation((key, value) => {
        if (key === "biblequest:daily-quest-cas:v1") {
          throw new Error("fixture storage unavailable");
        }
        nativeSetItem(key, value);
      });

    try {
      await startSync("account-a");

      expect(useSyncStatus.getState()).toMatchObject({
        state: "error",
        initialSyncComplete: false,
      });
      expect(useQuestOS.getState().profile?.displayName).toBe("Local guest");
      expect(initialSyncIsPending("account-a")).toBe(true);
    } finally {
      storageWrite.mockRestore();
      stopSync();
    }
  });

  it("resumes guest adoption interrupted before its generation was stored", async () => {
    const snapshot = currentSnapshot();
    useQuestOS.getState().importData(snapshot);
    // Recreate the durable state left if iOS stops after owner stamping but
    // before the first merged generation reaches local storage.
    await markInitialSyncPending("account-a");
    await setLastSyncedUserId("account-a");
    mocks.createClient.mockReturnValue(fakeClient());

    await startSync("account-a");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(mocks.generations.get("account-a")).toBe(0);
    expect(useQuestOS.getState().profile?.displayName).toBe(
      snapshot.profile?.displayName,
    );
    expect(useQuestOS.getState().prayers).toEqual(snapshot.prayers);
    expect(useQuestOS.getState().reflections).toEqual(snapshot.reflections);
    expect(initialSyncIsPending("account-a")).toBe(false);
  });

  it("keeps an existing account authoritative during interrupted adoption", async () => {
    const guest = currentSnapshot();
    useQuestOS.getState().importData(guest);
    await markInitialSyncPending("account-a");
    await setLastSyncedUserId("account-a");
    const existingProfile = {
      ...guest.profile!,
      displayName: "Existing account owner",
    };
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        async (table) =>
          table === "profiles"
            ? {
                data: profileToRow("account-a", existingProfile),
                error: null,
              }
            : undefined,
      ),
    );

    await startSync("account-a");

    expect(useQuestOS.getState().profile?.displayName).toBe(
      "Existing account owner",
    );
    expect(useQuestOS.getState().prayers).toEqual(guest.prayers);
    expect(initialSyncIsPending("account-a")).toBe(false);
  });

  it("joins unique guest rows without replacing an existing account", async () => {
    const guest = currentSnapshot();
    useQuestOS.getState().importData(guest);
    const existing = currentSnapshot();
    existing.profile = {
      ...existing.profile!,
      displayName: "Existing account owner",
    };
    existing.settings = {
      ...existing.settings,
      analyticsConsent: false,
      language: "es",
    };
    const existingSettings = settingsToRows("account-a", existing.settings);
    const mutableWrites: unknown[] = [];
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        async () => ({ data: [], error: null }),
        undefined,
        async (name, args) => {
          if (name === "upsert_mutable_account_rows") {
            mutableWrites.push(args?.p_resource);
          }
          return undefined;
        },
        async (table) => {
          if (table === "profiles") {
            return {
              data: profileToRow("account-a", existing.profile!),
              error: null,
            };
          }
          if (table === "user_settings") {
            return { data: existingSettings.settings, error: null };
          }
          if (table === "notification_preferences") {
            return { data: existingSettings.notifications, error: null };
          }
          return undefined;
        },
      ),
    );

    await startSync("account-a");

    expect(useQuestOS.getState().profile?.displayName).toBe(
      "Existing account owner",
    );
    expect(useQuestOS.getState().settings.language).toBe("es");
    expect(useQuestOS.getState().prayers).toEqual(guest.prayers);
    expect(useQuestOS.getState().reflections).toEqual(guest.reflections);
    expect(useQuestOS.getState().bookmarks).toEqual([
      { ...guest.bookmarks[0], translationKey: "web" },
    ]);
    expect(mutableWrites).not.toContain("profiles");
    expect(mutableWrites).not.toContain("user_settings");
    expect(mutableWrites).toEqual(
      expect.arrayContaining([
        "prayers",
        "reflections",
        "verse_bookmarks",
      ]),
    );
  });

  it("clears the other journey after an explicit start-fresh handoff", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    await setLastSyncedUserId("account-a");
    await handoff("account-b", true);
    mocks.createClient.mockReturnValue(fakeClient());

    await startSync("account-b");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(useQuestOS.getState().profile).toBeNull();
    expect(useQuestOS.getState().prayers).toEqual([]);
    expect(localJourneyClaimIsPending("account-b")).toBe(false);
  });

  it("does not stamp the new owner when the blank journey was not persisted", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    await setLastSyncedUserId("account-a");
    // The reviewed purge removes the journey bytes directly and proves the
    // removal by reading them back, so leaving the bytes in place is what
    // fails that proof. Both namespaces are covered because which key the
    // store selects depends on the cutover state.
    const blocked = new Set<string>([
      LEGACY_QUEST_JOURNEY_STORAGE_KEY,
      WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
    ]);
    window.localStorage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "{}");
    const nativeRemoveItem = window.localStorage.removeItem.bind(
      window.localStorage,
    );
    const removeItem = vi
      .spyOn(window.localStorage, "removeItem")
      .mockImplementation((key: string) => {
        if (!blocked.has(key)) nativeRemoveItem(key);
      });

    await expect(
      handoff("account-b", true),
    ).rejects.toThrow("The previous journey could not be cleared.");
    expect(getLastSyncedUserId()).toBe("account-a");
    removeItem.mockRestore();
  });

  it("does not stamp the new owner when private draft cleanup cannot commit", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    await setLastSyncedUserId("account-a");
    // Draft cleanup also proves its removals by reading them back, so a key
    // that survives removal is what makes the cleanup refuse to commit.
    const blocked = new Set<string>([
      LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
      WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
    ]);
    window.localStorage.setItem(
      LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
      "2026-08-01T00:00:00.000Z",
    );
    const nativeRemoveItem = window.localStorage.removeItem.bind(
      window.localStorage,
    );
    const removeItem = vi
      .spyOn(window.localStorage, "removeItem")
      .mockImplementation((key: string) => {
        if (!blocked.has(key)) nativeRemoveItem(key);
      });

    await expect(
      handoff("account-b", true),
    ).rejects.toThrow("The previous journey could not be cleared.");
    expect(getLastSyncedUserId()).toBe("account-a");
    removeItem.mockRestore();
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

  it("does not attempt a legacy recent-verse write when the pulled table is absent", async () => {
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

    expect(attempts).toEqual(["pull"]);
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

  // Allows the intentionally large pagination fixture to run under full-suite load.
  it(
    "paginates beyond a 500-row server cap without dropping the newest mutable row",
    async () => {
      const basePrayer = currentSnapshot().prayers[0];
      const serverRows = Array.from({ length: 1_001 }, (_, index) => {
        const timestamp = new Date(
          Date.parse("2026-01-01T00:00:00.000Z") + index * 1_000,
        ).toISOString();
        return prayerToRow("account-a", {
          ...basePrayer,
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      });
      const newestId = serverRows.at(-1)?.id;
      const prayerPulls: FakeSelectQuery[] = [];
      const prayerWrites: unknown[] = [];
      mocks.createClient.mockReturnValue(
        fakeClient(
          undefined,
          undefined,
          async (table, query) => {
            if (table !== "prayers") return { data: [], error: null };
            prayerPulls.push({
              ...query,
              equalities: [...query.equalities],
              orders: [...query.orders],
              range: query.range ? { ...query.range } : null,
            });
            return { data: serverRows, error: null };
          },
          undefined,
          async (name, args) => {
            if (
              name === "upsert_mutable_account_rows" &&
              args?.p_resource === "prayers"
            ) {
              prayerWrites.push(args.p_rows);
            }
            return undefined;
          },
          undefined,
          // Emulate a project max_rows setting below the requested page size.
          500,
        ),
      );

      await startSync("account-a");
      expect(useQuestOS.getState().prayers).toHaveLength(1_001);
      expect(
        useQuestOS.getState().prayers.some(({ id }) => id === newestId),
      ).toBe(true);

      await retrySync("account-a");

      expect(useQuestOS.getState().prayers).toHaveLength(1_001);
      expect(
        useQuestOS.getState().prayers.some(({ id }) => id === newestId),
      ).toBe(true);
      expect(prayerWrites).toEqual([]);
      expect(prayerPulls.map(({ range }) => range)).toEqual([
        { from: 0, to: 999 },
        { from: 500, to: 1_499 },
        { from: 1_000, to: 1_999 },
        { from: 1_001, to: 2_000 },
        { from: 0, to: 999 },
        { from: 500, to: 1_499 },
        { from: 1_000, to: 1_999 },
        { from: 1_001, to: 2_000 },
      ]);
      expect(prayerPulls[0]).toMatchObject({
        equalities: [{ column: "user_id", value: "account-a" }],
        orders: [
          { ascending: true, column: "created_at" },
          { ascending: true, column: "id" },
        ],
      });
    },
    15_000,
  );

  it("keeps local intent ahead of future-clock rows and caps by server receipt", async () => {
    const serverRows = Array.from({ length: 20 }, (_, index) => ({
      user_id: "account-a",
      book_slug: "psalms",
      book_name: "Psalms",
      chapter: 1,
      verse_start: index + 1,
      verse_end: index + 1,
      reference: `Psalms 1:${index + 1}`,
      text: `Server verse ${index + 1}`,
      // Alternate +24-hour and +1-year clocks; neither controls the cap.
      viewed_at:
        index % 2 === 0
          ? "2026-07-23T12:00:00.000Z"
          : "2027-07-22T12:00:00.000Z",
      server_seen_at: new Date(
        Date.parse("2026-07-22T12:00:00.000Z") - index * 60_000,
      ).toISOString(),
    })).reverse();
    const recentWrites: unknown[][] = [];
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        async (table) => ({
          data: table === "user_recent_verses" ? serverRows : [],
          error: null,
        }),
        undefined,
        async (name, args) => {
          if (
            name === "upsert_mutable_account_rows" &&
            args?.p_resource === "user_recent_verses"
          ) {
            recentWrites.push(
              Array.isArray(args.p_rows) ? args.p_rows : [],
            );
          }
          return undefined;
        },
      ),
    );

    await startSync("account-a");
    useQuestOS.getState().recordRecentVerse({
      bookSlug: "romans",
      bookName: "Romans",
      chapter: 8,
      verseStart: 1,
      verseEnd: 1,
      reference: "Romans 8:1",
      text: "A genuinely recent local passage",
    });
    await retrySync("account-a");

    const history = useQuestOS.getState().recentVerses;
    expect(history).toHaveLength(20);
    expect(history[0]?.reference).toBe("Romans 8:1");
    expect(history.some((verse) => verse.reference === "Psalms 1:1")).toBe(
      true,
    );
    expect(history.some((verse) => verse.reference === "Psalms 1:20")).toBe(
      false,
    );
    expect(recentWrites.flat()).toHaveLength(1);
  });

  it.each([undefined, "not-a-timestamp"])(
    "fails closed when recent-verse server order is %s",
    async (serverSeenAt) => {
      mocks.createClient.mockReturnValue(
        fakeClient(undefined, undefined, async (table) => ({
          data:
            table === "user_recent_verses"
              ? [
                  {
                    user_id: "account-a",
                    book_slug: "john",
                    book_name: "John",
                    chapter: 1,
                    verse_start: 1,
                    verse_end: 1,
                    reference: "John 1:1",
                    text: "Fixture verse",
                    viewed_at: "2027-07-22T12:00:00.000Z",
                    server_seen_at: serverSeenAt,
                  },
                ]
              : [],
          error: null,
        })),
      );

      await startSync("account-a");

      expect(useSyncStatus.getState()).toMatchObject({
        state: "error",
        initialSyncComplete: false,
      });
      expect(getLastSyncedUserId()).toBeNull();
    },
  );

  it("allows the same user to stop and restart sync", async () => {
    await setLastSyncedUserId("account-a");
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

  it("never rolls revisioned bookmarks back to a direct legacy upsert", async () => {
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
    await handoff("account-a", false);

    const legacyBatches: unknown[][] = [];
    const revisionedResources: unknown[] = [];
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
      }, undefined, undefined, async (name, args) => {
        if (name === "upsert_mutable_account_rows") {
          revisionedResources.push(args?.p_resource);
        }
        return undefined;
      }),
    );

    await startSync("account-a");

    expect(useSyncStatus.getState().state).toBe("idle");
    expect(legacyBatches).toHaveLength(0);
    expect(revisionedResources).toContain("verse_bookmarks");
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

  it("turns a stalled account request into a retryable error", async () => {
    vi.useFakeTimers();
    const stalledPull = deferred();
    mocks.createClient.mockReturnValue(fakeClient(stalledPull.promise));

    try {
      const restore = startSync("account-a");
      await vi.advanceTimersByTimeAsync(SYNC_REQUEST_DEADLINE_MS);
      await restore;

      expect(useSyncStatus.getState()).toMatchObject({
        state: "error",
        userId: "account-a",
        initialSyncComplete: false,
      });
      expect(initialSyncIsPending("account-a")).toBe(true);
    } finally {
      stopSync();
      stalledPull.resolve();
      vi.useRealTimers();
    }
  });

  it("allows a large restore to exceed one request deadline in aggregate", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        undefined,
        undefined,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 6_000));
          return undefined;
        },
      ),
    );

    try {
      const restore = startSync("account-a");
      await vi.runAllTimersAsync();
      await restore;

      expect(Date.now() - startedAt).toBeGreaterThan(
        SYNC_REQUEST_DEADLINE_MS,
      );
      expect(useSyncStatus.getState()).toMatchObject({
        state: "idle",
        userId: "account-a",
        initialSyncComplete: true,
      });
    } finally {
      stopSync();
      vi.useRealTimers();
    }
  });

  it("keeps first-account adoption pending when its initial push fails", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    mocks.createClient.mockReturnValue(
      fakeClient(undefined, undefined, undefined, undefined, async (name, args) =>
        name === "upsert_mutable_account_rows" &&
        args?.p_resource === "verse_bookmarks"
          ? {
              data: null,
              error: { code: "503", message: "fixture push unavailable" },
            }
          : undefined,
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
    await handoff("account-a", false);
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
    await handoff("account-a", false);
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
      await handoff("account-a", false);
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
            profileNames.push(
              (rows[0] as { row?: { display_name?: unknown } })?.row
                ?.display_name,
            );
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

      await vi.waitFor(() => {
        expect(profileNames).toEqual([
          currentSnapshot().profile?.displayName,
          "Edited in flight",
        ]);
      });
    } finally {
      stopSync();
      vi.useRealTimers();
    }
  });

  it("fails the initial sync closed when a mutable revision conflicts", async () => {
    useQuestOS.getState().importData(currentSnapshot());
    await handoff("account-a", false);
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

  it("recovers a write-through revision conflict with a full reconciliation", async () => {
    vi.useFakeTimers();
    try {
      useQuestOS.getState().importData(currentSnapshot());
      await handoff("account-a", false);
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

      await vi.waitFor(() => {
        expect(useSyncStatus.getState()).toMatchObject({
          state: "error",
          initialSyncComplete: true,
        });
      });
      await vi.advanceTimersByTimeAsync(30_000);

      await vi.waitFor(() => {
        expect(mocks.createClient).toHaveBeenCalledTimes(3);
        expect(useSyncStatus.getState()).toMatchObject({
          state: "idle",
          initialSyncComplete: true,
        });
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
    await setLastSyncedUserId("account-a");
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
    await setLastSyncedUserId("account-a");
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

  it("carries an offline profile edit across a startup partial deletion", async () => {
    const canonical = currentSnapshot();
    canonical.profile = {
      ...canonical.profile!,
      displayName: "Canonical account profile",
    };
    let generation = 0;
    let bookmarkPresent = true;
    const profileWrites: unknown[] = [];
    await setLastSyncedUserId("account-a");
    mocks.generations.set("account-a", 0);
    mocks.createClient.mockReturnValue(
      fakeClient(
        undefined,
        undefined,
        async (table) => ({
          data:
            table === "verse_bookmarks" && bookmarkPresent
              ? [bookmarkToRow("account-a", canonical.bookmarks[0])]
              : [],
          error: null,
        }),
        undefined,
        async (name, args) => {
          if (name === "account_sync_generation") {
            return { data: { generation }, error: null };
          }
          if (name === "delete_user_sync_rows") {
            bookmarkPresent = false;
            generation += 1;
            return {
              data: { deleted: 1, duplicate: false, generation },
              error: null,
            };
          }
          if (
            name === "upsert_mutable_account_rows" &&
            args?.p_resource === "profiles"
          ) {
            profileWrites.push(args.p_rows);
          }
          return undefined;
        },
        async (table) =>
          table === "profiles"
            ? {
                data: profileToRow("account-a", canonical.profile!),
                error: null,
              }
            : undefined,
      ),
    );

    await startSync("account-a");
    stopSync();
    useQuestOS.getState().updateProfile({ displayName: "Offline profile edit" });
    const bookmark = useQuestOS.getState().bookmarks[0];
    useQuestOS.getState().toggleBookmark({
      bookSlug: bookmark.bookSlug,
      bookName: bookmark.bookName,
      chapter: bookmark.chapter,
      verse: bookmark.verse,
      text: bookmark.text,
      translationKey: bookmark.translationKey,
      note: bookmark.note,
    });

    await startSync("account-a");

    expect(useQuestOS.getState().profile?.displayName).toBe(
      "Offline profile edit",
    );
    expect(useQuestOS.getState().bookmarks).toEqual([]);
    expect(profileWrites).toContainEqual([
      expect.objectContaining({
        expected_revision: 0,
        row: expect.objectContaining({ display_name: "Offline profile edit" }),
      }),
    ]);
    expect(mocks.generations.get("account-a")).toBe(1);
  });

  it("keeps a restored unfinished assignment after a whole-account purge", async () => {
    vi.useFakeTimers();
    try {
      const day = "2026-07-16";
      const observed = currentSnapshot().assignments[day][0];
      let generation = 0;
      let purged = false;
      const dailyWrites: Array<{ generation: unknown; rows: unknown[] }> = [];
      await setLastSyncedUserId("account-a");
      mocks.generations.set("account-a", 0);
      mocks.createClient.mockReturnValue(
        fakeClient(
          undefined,
          undefined,
          async (table) => {
            if (table === "user_daily_quest_days") {
              return {
                data: purged ? [] : [{ assigned_date: day, revision: 1 }],
                error: null,
              };
            }
            if (table === "user_daily_quests") {
              return {
                data: purged ? [] : [assignmentToRow("account-a", observed)],
                error: null,
              };
            }
            return { data: [], error: null };
          },
          undefined,
          async (name, args) => {
            if (name === "account_sync_generation") {
              return { data: { generation }, error: null };
            }
            if (name === "purge_user_data") {
              generation += 1;
              purged = true;
              return {
                data: { duplicate: false, generation },
                error: null,
              };
            }
            if (name === "replace_user_daily_quests") {
              const rows = Array.isArray(args?.p_rows) ? args.p_rows : [];
              dailyWrites.push({
                generation: args?.p_expected_generation,
                rows,
              });
              return {
                data: {
                  status: "applied",
                  revision: purged ? 1 : 2,
                  duplicate: false,
                  rows,
                  generation: args?.p_expected_generation,
                },
                error: null,
              };
            }
            return undefined;
          },
        ),
      );

      await startSync("account-a");
      expect(useQuestOS.getState().assignments[day]).toEqual([observed]);

      const restored = currentSnapshot();
      restored.assignments[day] = [{ ...observed, status: "started" }];
      useQuestOS.getState().importData(restored, { purgeAccount: "account-a" });
      await vi.advanceTimersByTimeAsync(2_500);

      await vi.waitFor(() => {
        expect(useSyncStatus.getState()).toMatchObject({
          state: "idle",
          initialSyncComplete: true,
        });
        expect(dailyWrites).toContainEqual({
          generation: 1,
          rows: [
            expect.objectContaining({
              quest_slug: observed.questSlug,
              status: "started",
            }),
          ],
        });
      });
      expect(useQuestOS.getState().assignments[day]).toEqual([
        expect.objectContaining({
          questSlug: observed.questSlug,
          status: "started",
        }),
      ]);
    } finally {
      stopSync();
      vi.useRealTimers();
    }
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
    await setLastSyncedUserId("account-a");
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
      await handoff("account-a", false);
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

      await vi.waitFor(() => {
        expect(useSyncStatus.getState()).toMatchObject({
          state: "idle",
          initialSyncComplete: true,
        });
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

  it("does not use account timestamps as merge authority", () => {
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

    expect(merged.profile?.displayName).toBe("Local older profile");
    expect(merged.settings.language).toBe("en");
    expect(merged.settings.updatedAt).toBe("2026-07-22T19:00:00.000Z");
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

  it("merges recent verses by passage, preserves local order, and caps at twenty", () => {
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
    expect(merged.recentVerses?.[0].reference).toBe("John 1:1");
    expect(merged.recentVerses?.some((verse) => verse.reference === "Romans 8:1"))
      .toBe(false);
    expect(merged.recentVerses?.find((verse) => verse.reference === "John 1:20")?.text)
      .toBe("Local 20");
  });
});
