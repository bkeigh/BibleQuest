import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  asyncClears: {
    avatar: vi.fn(async () => true),
    auth: vi.fn<
      () => Promise<
        "cleared" | "different-user" | "not-native" | "unavailable"
      >
    >(async () => "cleared"),
    reminders: vi.fn(async () => undefined),
  },
  clearDrafts: vi.fn(() => true),
  clearGenerations: vi.fn(() => true),
  purgeJourney: vi.fn(() => true),
  clearLastUser: vi.fn(),
  clearMutable: vi.fn(() => true),
  clearQuests: vi.fn(() => true),
  clearRhythm: vi.fn(() => true),
  clearGame: vi.fn(() => true),
  clearSevenDays: vi.fn(() => true),
  owner: { status: "owned", userId: "account-a" } as
    | { status: "owned"; userId: string }
    | { status: "unowned" }
    | { status: "unavailable"; reason: "storage" },
  purgeBackup: vi.fn(async () => true),
  resumeBackup: vi.fn(),
  stopSync: vi.fn(),
}));

vi.mock("@/lib/questos/purge", () => ({
  purgePersistedJourney: mocks.purgeJourney,
}));
vi.mock("@/lib/questos/journal-drafts", () => ({
  purgeAllDeviceLocalJournalDrafts: mocks.clearDrafts,
}));
vi.mock("@/lib/sync/last-user", () => ({
  readLocalJourneyOwner: () => mocks.owner,
  clearLastSyncedUserId: mocks.clearLastUser,
}));
vi.mock("@/lib/sync/generation", () => ({
  removeStoredAccountSyncGeneration: mocks.clearGenerations,
}));
vi.mock("@/lib/sync/daily-quests", () => ({
  removeStoredDailyQuestSyncContext: mocks.clearQuests,
}));
vi.mock("@/lib/sync/mutable-revisions", () => ({
  removeStoredMutableRevisionContext: mocks.clearMutable,
}));
vi.mock("@/lib/supabase/native-auth-storage", () => ({
  clearNativeAuthStorageForUser: mocks.asyncClears.auth,
}));
vi.mock("@/lib/rhythm/client", () => ({
  clearRhythmState: mocks.clearRhythm,
}));
vi.mock("@/lib/games/storage", () => ({ clearGameProgress: mocks.clearGame }));
vi.mock("@/lib/games/seven-days/progress", () => ({
  clearSevenDaysProgress: mocks.clearSevenDays,
}));
vi.mock("@/lib/games/seven-days/tutorial", () => ({
  SEVEN_DAYS_TUTORIAL_STORAGE_KEY: "fixture-tutorial",
}));
vi.mock("@/lib/games/arcade/boosts", () => ({
  BOOST_STORAGE_KEY: "fixture-boosts",
}));
vi.mock("@/lib/utils/avatar", () => ({
  purgeAvatarCache: mocks.asyncClears.avatar,
}));
vi.mock("@/lib/native/journey-backup", () => ({
  purgeJourneyBackup: mocks.purgeBackup,
  resumeJourneyBackupAfterPurge: mocks.resumeBackup,
}));
vi.mock("@/lib/native/reminders", () => ({
  purgeNativeReminders: mocks.asyncClears.reminders,
}));
vi.mock("@/lib/sync/engine", () => ({ stopSync: mocks.stopSync }));

import { purgeDeletedAccountDeviceData } from "@/lib/auth/device-account-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    },
  });
  mocks.owner = { status: "owned", userId: "account-a" };
  mocks.purgeBackup.mockResolvedValue(true);
  mocks.asyncClears.avatar.mockResolvedValue(true);
  mocks.asyncClears.reminders.mockResolvedValue(undefined);
  mocks.asyncClears.auth.mockResolvedValue("cleared");
  mocks.purgeJourney.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deleted-account device cleanup", () => {
  it("purges every account and device-only store for the exact owner", async () => {
    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(true);

    expect(mocks.stopSync).toHaveBeenCalledOnce();
    expect(mocks.purgeBackup).toHaveBeenCalledOnce();
    for (const clear of [
      mocks.purgeJourney,
      mocks.clearDrafts,
      mocks.clearLastUser,
      mocks.clearGenerations,
      mocks.clearQuests,
      mocks.clearMutable,
      mocks.clearRhythm,
      mocks.clearGame,
      mocks.clearSevenDays,
      mocks.asyncClears.auth,
      mocks.asyncClears.reminders,
      mocks.asyncClears.avatar,
    ]) {
      expect(clear).toHaveBeenCalledOnce();
    }
    expect(mocks.resumeBackup).toHaveBeenCalledOnce();
  });

  it("never erases a different account or an unknown owner", async () => {
    mocks.owner = { status: "owned", userId: "account-b" };
    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(true);
    expect(mocks.stopSync).not.toHaveBeenCalled();
    expect(mocks.purgeBackup).not.toHaveBeenCalled();
    expect(mocks.purgeJourney).not.toHaveBeenCalled();
    expect(mocks.asyncClears.auth).toHaveBeenCalledWith("account-a");
  });

  it("preserves a newer credential reported by the atomic Keychain boundary", async () => {
    mocks.asyncClears.auth.mockResolvedValue("different-user");

    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(true);

    expect(mocks.purgeJourney).toHaveBeenCalledOnce();
    expect(mocks.asyncClears.auth).toHaveBeenCalledWith("account-a");
  });

  it("rechecks ownership after a delayed mirror purge before clearing", async () => {
    let releasePurge!: (value: boolean) => void;
    mocks.purgeBackup.mockReturnValue(
      new Promise<boolean>((resolve) => {
        releasePurge = resolve;
      }),
    );

    const cleanup = purgeDeletedAccountDeviceData("account-a");
    await vi.waitFor(() => expect(mocks.purgeBackup).toHaveBeenCalledOnce());
    mocks.owner = { status: "owned", userId: "account-b" };
    releasePurge(true);

    await expect(cleanup).resolves.toBe(false);
    expect(mocks.purgeJourney).not.toHaveBeenCalled();
    expect(mocks.resumeBackup).not.toHaveBeenCalled();
  });

  it("refuses a second account cleanup while the device lifecycle is owned", async () => {
    let releasePurge!: (value: boolean) => void;
    mocks.purgeBackup.mockReturnValue(
      new Promise<boolean>((resolve) => {
        releasePurge = resolve;
      }),
    );

    const cleanupA = purgeDeletedAccountDeviceData("account-a");
    await vi.waitFor(() => expect(mocks.purgeBackup).toHaveBeenCalledOnce());
    await expect(purgeDeletedAccountDeviceData("account-b")).resolves.toBe(false);
    releasePurge(true);

    await expect(cleanupA).resolves.toBe(true);
    expect(mocks.purgeJourney).toHaveBeenCalledOnce();
  });

  it("keeps the primary intact when the protected mirror cannot be tombstoned", async () => {
    mocks.purgeBackup.mockResolvedValue(false);
    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(false);
    expect(mocks.purgeJourney).not.toHaveBeenCalled();
    expect(mocks.resumeBackup).not.toHaveBeenCalled();
  });

  it("retains a durable owner and credential until a partial purge can retry", async () => {
    mocks.asyncClears.avatar.mockResolvedValue(false);
    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(false);
    expect(mocks.asyncClears.avatar).toHaveBeenCalledOnce();
    expect(mocks.purgeJourney).toHaveBeenCalledOnce();
    expect(mocks.clearLastUser).not.toHaveBeenCalled();
    expect(mocks.asyncClears.auth).not.toHaveBeenCalled();
    expect(mocks.resumeBackup).not.toHaveBeenCalled();

    mocks.asyncClears.avatar.mockResolvedValue(true);
    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(true);
    expect(mocks.clearLastUser).toHaveBeenCalledOnce();
    expect(mocks.asyncClears.auth).toHaveBeenCalledOnce();
    expect(mocks.resumeBackup).toHaveBeenCalledOnce();
  });

  it("retains owner and credential when the blank primary was not persisted", async () => {
    mocks.purgeJourney.mockReturnValue(false);

    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(false);

    expect(mocks.purgeJourney).toHaveBeenCalledOnce();
    expect(mocks.clearLastUser).not.toHaveBeenCalled();
    expect(mocks.asyncClears.auth).not.toHaveBeenCalled();
    expect(mocks.resumeBackup).not.toHaveBeenCalled();
  });
});
