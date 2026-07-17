import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyTombstones } from "@/lib/questos/types";
import { currentSnapshot, emptySnapshot } from "./fixtures";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/analytics/events", () => ({
  track: mocks.track,
  setAnalyticsConsent: vi.fn(),
}));

import {
  filterByTombstones,
  mergeSnapshots,
  startSync,
  stopSync,
} from "@/lib/sync/engine";
import {
  clearLastSyncedUserId,
  getLastSyncedUserId,
  setLastSyncedUserId,
} from "@/lib/sync/last-user";
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

function fakeClient(waitFor?: Promise<void>): SupabaseClient {
  const ready = waitFor ?? Promise.resolve();
  const from = () => {
    const query = {
      select: () => query,
      eq: () => query,
      delete: () => query,
      in: async () => OK,
      match: async () => OK,
      maybeSingle: async () => {
        await ready;
        return OK;
      },
      upsert: async () => OK,
      insert: async () => OK,
      then: (
        resolve: (value: { data: unknown[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown
      ) => ready.then(() => ({ data: [], error: null })).then(resolve, reject),
    };
    return query;
  };
  return {
    from,
    rpc: async () => OK,
  } as unknown as SupabaseClient;
}

describe("sync ownership, lifecycle, and merge safety", () => {
  beforeEach(() => {
    stopSync();
    clearLastSyncedUserId();
    useQuestOS.getState().clearAllData();
    useSyncStatus.setState({ state: "off", lastSyncedAt: null });
    mocks.createClient.mockReset();
  });

  it("refuses an automatic handoff to a different user", async () => {
    setLastSyncedUserId("account-a");

    await startSync("account-b");

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(useSyncStatus.getState().state).toBe("off");
    expect(getLastSyncedUserId()).toBe("account-a");
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
