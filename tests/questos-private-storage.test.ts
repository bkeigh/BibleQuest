import { beforeEach, describe, expect, it, vi } from "vitest";

const authBoundary = vi.hoisted(() => ({
  installingReadAllowed: false,
  readAllowed: false,
  writeAllowed: false,
}));

vi.mock("@/lib/supabase/web-auth-storage", () => ({
  beginWebPrivateWrite: () =>
    authBoundary.writeAllowed ? { generation: "a" } : null,
  registerWebPrivateMemoryReset: () => () => undefined,
  webPrivateInstallingReadAllowed: () =>
    authBoundary.installingReadAllowed,
  webPrivateReadAllowed: () => authBoundary.readAllowed,
  webPrivateWriteGuardIsCurrent: () => authBoundary.writeAllowed,
  withWebAuthStorageLock: async <T>(operation: () => Promise<T>) =>
    operation(),
}));

import {
  coordinateQuestOSWebPrivateHydration,
  createQuestJourneyStorage,
  resetQuestOSWebPrivateMemory,
  useQuestOS,
} from "@/lib/questos/store";
import {
  LEGACY_QUEST_JOURNEY_STORAGE_KEY,
  WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
  WEB_PRIVATE_NAMESPACE_V2_MARKER,
  WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
} from "@/lib/storage/web-private-namespace";

/** Uses the deterministic localStorage installed by the shared test setup. */
function storage(): Storage {
  return window.localStorage;
}

/** Creates the smallest current-version persisted journey used by hydration. */
function persistedJourney(displayName: string): string {
  return JSON.stringify({
    state: {
      profile: {
        displayName,
      },
    },
    version: 18,
  });
}

describe("QuestOS web-private read capability", () => {
  beforeEach(() => {
    authBoundary.installingReadAllowed = false;
    authBoundary.readAllowed = false;
    authBoundary.writeAllowed = false;
    resetQuestOSWebPrivateMemory();
  });

  it("denies every direct web read even when a namespace marker exists", () => {
    const target = storage();
    target.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "legacy-secret");
    target.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "v2-secret");
    const adapter = createQuestJourneyStorage(target, false);

    authBoundary.readAllowed = true;
    expect(adapter.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY)).toBeNull();
    target.setItem(
      WEB_PRIVATE_NAMESPACE_V2_MARKER,
      WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
    );
    expect(adapter.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY)).toBeNull();
    expect(adapter.getItem("unexpected-key")).toBeNull();
  });

  it("hydrates v2 only inside the exact current-account coordinator", async () => {
    const target = storage();
    const persistedStorage = useQuestOS.persist.getOptions().storage;
    expect(persistedStorage).toBeDefined();
    const read = vi.spyOn(persistedStorage!, "getItem");
    target.setItem(
      WEB_PRIVATE_NAMESPACE_V2_MARKER,
      WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
    );
    target.setItem(
      WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
      persistedJourney("Private A"),
    );
    authBoundary.readAllowed = true;

    await useQuestOS.persist.rehydrate();
    expect(useQuestOS.getState().profile).toBeNull();

    expect(await coordinateQuestOSWebPrivateHydration()).toBe(true);
    expect(read).toHaveReturnedWith({
      state: { profile: { displayName: "Private A" } },
      version: 18,
    });
    expect(useQuestOS.getState().profile).toEqual({ displayName: "Private A" });

    resetQuestOSWebPrivateMemory();
    authBoundary.readAllowed = false;
    await useQuestOS.persist.rehydrate();
    expect(useQuestOS.getState().profile).toBeNull();
  });

  it("keeps the native journey on its reviewed legacy hydration path", () => {
    const target = storage();
    target.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "native-journey");
    target.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "uncommitted-v2");

    expect(
      createQuestJourneyStorage(target, true).getItem(
        LEGACY_QUEST_JOURNEY_STORAGE_KEY,
      ),
    ).toBe("native-journey");
  });
});
