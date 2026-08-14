import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  asyncClears: {
    avatar: vi.fn(async () => true),
    nativeAuth: vi.fn<
      () => Promise<
        "cleared" | "different-user" | "not-native" | "unavailable"
      >
    >(async () => "cleared"),
    webAuth: vi.fn<
      () => Promise<
        "cleared" | "different-user" | "missing" | "unavailable"
      >
    >(async () => "cleared"),
    webPurgeConfirmed: vi.fn(
      async (
        _handle: object,
        _userId: string,
        proveOrPurge: () => Promise<boolean>,
      ) => proveOrPurge(),
    ),
    reminders: vi.fn(async () => undefined),
  },
  clearDrafts: vi.fn(() => true),
  clearGenerations: vi.fn(() => true),
  purgeJourney: vi.fn(() => true),
  purgeAllWeb: vi.fn(async () => true),
  proveAllWebEmpty: vi.fn(async () => true),
  clearLastUser: vi.fn(),
  clearMutable: vi.fn(() => true),
  clearQuests: vi.fn(() => true),
  clearRhythm: vi.fn(() => true),
  clearSignInTracking: vi.fn(() => true),
  clearGame: vi.fn(() => true),
  clearSevenDays: vi.fn(() => true),
  removePrivate: vi.fn(async () => true),
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
  clearNativeAuthStorageForUser: mocks.asyncClears.nativeAuth,
}));
vi.mock("@/lib/supabase/web-auth-storage", () => ({
  clearExpectedWebAuthSubject: mocks.asyncClears.webAuth,
  confirmTerminalWebPrivateDataPurge: mocks.asyncClears.webPurgeConfirmed,
  withWebAccountOperationLock: <T>(
    operation: (handle: object) => Promise<T>,
  ) => operation({}),
}));
vi.mock("@/lib/rhythm/client", () => ({
  purgeRhythmState: mocks.clearRhythm,
}));
vi.mock("@/lib/games/storage", () => ({ purgeGameProgress: mocks.clearGame }));
vi.mock("@/lib/games/seven-days/progress", () => ({
  purgeSevenDaysProgress: mocks.clearSevenDays,
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
vi.mock("@/lib/auth/sign-in-tracking", () => ({
  clearSignInTrackingStamp: mocks.clearSignInTracking,
}));
vi.mock("@/lib/storage/web-private-write", () => ({
  removeWebPrivateStorageItem: mocks.removePrivate,
}));
vi.mock("@/lib/storage/web-private-cutover", () => ({
  proveAllWebPrivateDataNamespacesEmpty: mocks.proveAllWebEmpty,
  purgeAllWebPrivateDataNamespaces: mocks.purgeAllWeb,
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
  mocks.asyncClears.nativeAuth.mockResolvedValue("cleared");
  mocks.asyncClears.webAuth.mockResolvedValue("cleared");
  mocks.asyncClears.webPurgeConfirmed.mockImplementation(
    async (_handle, _userId, proveOrPurge) => proveOrPurge(),
  );
  mocks.purgeJourney.mockReturnValue(true);
  mocks.purgeAllWeb.mockResolvedValue(true);
  mocks.proveAllWebEmpty.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deleted-account device cleanup", () => {
  it("purges every account and device-only store for the exact owner", async () => {
    const result = await purgeDeletedAccountDeviceData("account-a");

    expect(mocks.stopSync).toHaveBeenCalledOnce();
    expect(mocks.purgeBackup).toHaveBeenCalledOnce();
    for (const clear of [
      mocks.purgeJourney,
      mocks.clearDrafts,
      mocks.clearLastUser,
      mocks.clearRhythm,
      mocks.clearGame,
      mocks.clearSevenDays,
      mocks.purgeAllWeb,
      mocks.asyncClears.webAuth,
      mocks.asyncClears.reminders,
      mocks.asyncClears.avatar,
    ]) {
      expect(clear).toHaveBeenCalledOnce();
    }
    expect(mocks.resumeBackup).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });

  it("retains deletion state for a different or unknown web owner", async () => {
    mocks.owner = { status: "owned", userId: "account-b" };
    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(false);
    expect(mocks.stopSync).not.toHaveBeenCalled();
    expect(mocks.purgeBackup).not.toHaveBeenCalled();
    expect(mocks.purgeJourney).not.toHaveBeenCalled();
    expect(mocks.asyncClears.webAuth).not.toHaveBeenCalled();
  });

  it("clears unowned web auth only after proving no private residue", async () => {
    mocks.owner = { status: "unowned" };

    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(true);
    expect(mocks.proveAllWebEmpty).toHaveBeenCalledOnce();
    expect(mocks.asyncClears.webPurgeConfirmed).toHaveBeenCalledOnce();
    expect(mocks.asyncClears.webAuth).toHaveBeenCalledWith("account-a");

    mocks.proveAllWebEmpty.mockResolvedValue(false);
    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(false);
    expect(mocks.asyncClears.webAuth).toHaveBeenCalledOnce();
  });

  it("retains unowned native auth without an exhaustive private-data proof", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_PLATFORM", "native");
    mocks.owner = { status: "unowned" };

    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(false);
    expect(mocks.asyncClears.nativeAuth).not.toHaveBeenCalled();
    expect(mocks.asyncClears.webAuth).not.toHaveBeenCalled();
  });

  it("preserves a newer credential reported by the atomic web boundary", async () => {
    mocks.asyncClears.webAuth.mockResolvedValue("different-user");

    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(true);

    expect(mocks.purgeJourney).toHaveBeenCalledOnce();
    expect(mocks.asyncClears.webAuth).toHaveBeenCalledWith("account-a");
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
    expect(mocks.asyncClears.webAuth).not.toHaveBeenCalled();
    expect(mocks.resumeBackup).not.toHaveBeenCalled();

    mocks.asyncClears.avatar.mockResolvedValue(true);
    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(true);
    expect(mocks.clearLastUser).toHaveBeenCalledOnce();
    expect(mocks.asyncClears.webAuth).toHaveBeenCalledOnce();
    expect(mocks.resumeBackup).toHaveBeenCalledOnce();
  });

  it("retains owner and credential when the blank primary was not persisted", async () => {
    mocks.purgeJourney.mockReturnValue(false);

    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(false);

    expect(mocks.purgeJourney).toHaveBeenCalledOnce();
    expect(mocks.clearLastUser).not.toHaveBeenCalled();
    expect(mocks.asyncClears.webAuth).not.toHaveBeenCalled();
    expect(mocks.resumeBackup).not.toHaveBeenCalled();
  });

  it("reports incomplete when final web credential cleanup is unavailable", async () => {
    mocks.asyncClears.webAuth.mockResolvedValue("unavailable");

    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(false);

    expect(mocks.clearLastUser).toHaveBeenCalledOnce();
    expect(mocks.asyncClears.webAuth).toHaveBeenCalledWith("account-a");
  });

  it("uses the existing exact-subject Keychain boundary on native", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_PLATFORM", "native");

    await expect(purgeDeletedAccountDeviceData("account-a")).resolves.toBe(true);

    expect(mocks.asyncClears.nativeAuth).toHaveBeenCalledWith("account-a");
    expect(mocks.asyncClears.webAuth).not.toHaveBeenCalled();
  });
});
