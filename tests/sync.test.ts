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
});
