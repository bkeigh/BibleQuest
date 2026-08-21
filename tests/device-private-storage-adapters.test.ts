import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as deviceStorage from "@/lib/storage/device-private-storage";
import * as deviceWrite from "@/lib/storage/device-private-write";
import * as webPrivateNamespace from "@/lib/storage/web-private-namespace";
import * as webPrivateWrite from "@/lib/storage/web-private-write";
import * as webAuthStorage from "@/lib/supabase/web-auth-storage";
import * as guestDeviceStorage from "@/native/guest/lib/storage/device-private-storage";
import * as guestDeviceWrite from "@/native/guest/lib/storage/device-private-write";

/** Lists every canonical storage constant and the reviewed implementation alias. */
const CANONICAL_STORAGE_ALIASES = [
  [
    deviceStorage.DEVICE_JOURNEY_STORAGE_KEY,
    webPrivateNamespace.LEGACY_QUEST_JOURNEY_STORAGE_KEY,
  ],
  [
    deviceStorage.PROTECTED_JOURNEY_STORAGE_KEY,
    webPrivateNamespace.WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
  ],
  [
    deviceStorage.DEVICE_JOURNAL_DRAFT_PREFIX,
    webPrivateNamespace.LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
  ],
  [
    deviceStorage.PROTECTED_JOURNAL_DRAFT_PREFIX,
    webPrivateNamespace.WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
  ],
  [
    deviceStorage.DEVICE_JOURNAL_DRAFTS_CLEARED_KEY,
    webPrivateNamespace.LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
  ],
  [
    deviceStorage.PROTECTED_JOURNAL_DRAFTS_CLEARED_KEY,
    webPrivateNamespace.WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
  ],
  [
    deviceStorage.DEVICE_RHYTHM_STORAGE_KEY,
    webPrivateNamespace.LEGACY_RHYTHM_STORAGE_KEY,
  ],
  [
    deviceStorage.PROTECTED_RHYTHM_STORAGE_KEY,
    webPrivateNamespace.WEB_V2_RHYTHM_STORAGE_KEY,
  ],
  [
    deviceStorage.DEVICE_GAME_STORAGE_KEY,
    webPrivateNamespace.LEGACY_GAME_STORAGE_KEY,
  ],
  [
    deviceStorage.PROTECTED_GAME_STORAGE_KEY,
    webPrivateNamespace.WEB_V2_GAME_STORAGE_KEY,
  ],
  [
    deviceStorage.DEVICE_SEVEN_DAYS_STORAGE_KEY,
    webPrivateNamespace.LEGACY_SEVEN_DAYS_STORAGE_KEY,
  ],
  [
    deviceStorage.PROTECTED_SEVEN_DAYS_STORAGE_KEY,
    webPrivateNamespace.WEB_V2_SEVEN_DAYS_STORAGE_KEY,
  ],
  [
    deviceStorage.DEVICE_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
    webPrivateNamespace.LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
  ],
  [
    deviceStorage.PROTECTED_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
    webPrivateNamespace.WEB_V2_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
  ],
  [
    deviceStorage.DEVICE_ARCADE_BOOST_STORAGE_KEY,
    webPrivateNamespace.LEGACY_ARCADE_BOOST_STORAGE_KEY,
  ],
  [
    deviceStorage.PROTECTED_ARCADE_BOOST_STORAGE_KEY,
    webPrivateNamespace.WEB_V2_ARCADE_BOOST_STORAGE_KEY,
  ],
  [
    deviceStorage.DEVICE_AVATAR_DATABASE_NAME,
    webPrivateNamespace.LEGACY_AVATAR_DATABASE_NAME,
  ],
  [
    deviceStorage.PROTECTED_AVATAR_DATABASE_NAME,
    webPrivateNamespace.WEB_V2_AVATAR_DATABASE_NAME,
  ],
] as const;

/** Lists every canonical function and the reviewed boundary function it preserves. */
const CANONICAL_FUNCTION_ALIASES = [
  [
    deviceStorage.selectDevicePrivateStorageKey,
    webPrivateNamespace.selectedWebPrivateStorageKey,
  ],
  [
    deviceStorage.selectDevicePrivateAvatarDatabase,
    webPrivateNamespace.selectedWebPrivateAvatarDatabase,
  ],
  [
    deviceStorage.readDevicePrivateStorageState,
    webPrivateNamespace.readWebPrivateNamespaceState,
  ],
  [deviceWrite.beginDevicePrivateWrite, webAuthStorage.beginWebPrivateWrite],
  [
    deviceWrite.registerDevicePrivateMemoryReset,
    webAuthStorage.registerWebPrivateMemoryReset,
  ],
  [
    deviceWrite.devicePrivateInstallingReadAllowed,
    webAuthStorage.webPrivateInstallingReadAllowed,
  ],
  [
    deviceWrite.devicePrivateReadAllowed,
    webAuthStorage.webPrivateReadAllowed,
  ],
  [
    deviceWrite.devicePrivateWriteGuardIsCurrent,
    webAuthStorage.webPrivateWriteGuardIsCurrent,
  ],
  [
    deviceWrite.withDevicePrivateStorageLock,
    webAuthStorage.withWebAuthStorageLock,
  ],
  [
    deviceWrite.captureDevicePrivateStorageReadLease,
    webPrivateWrite.captureWebPrivateStorageReadLease,
  ],
  [
    deviceWrite.removeDevicePrivateStorageItem,
    webPrivateWrite.removeWebPrivateStorageItem,
  ],
  [
    deviceWrite.setDevicePrivateStorageItem,
    webPrivateWrite.setWebPrivateStorageItem,
  ],
  [
    deviceWrite.devicePrivateStorageReadAllowed,
    webPrivateWrite.webPrivateStorageReadAllowed,
  ],
  [
    deviceWrite.devicePrivateStorageReadLeaseIsCurrent,
    webPrivateWrite.webPrivateStorageReadLeaseIsCurrent,
  ],
  [
    deviceWrite.withDevicePrivateRemovalGuard,
    webPrivateWrite.withWebPrivateRemovalGuard,
  ],
  [
    deviceWrite.withDevicePrivateWriteGuard,
    webPrivateWrite.withWebPrivateWriteGuard,
  ],
] as const;

/** Lists every guest protected alias that must remain the same device-only key. */
const GUEST_DEVICE_ONLY_ALIASES = [
  [
    guestDeviceStorage.PROTECTED_JOURNEY_STORAGE_KEY,
    guestDeviceStorage.DEVICE_JOURNEY_STORAGE_KEY,
  ],
  [
    guestDeviceStorage.PROTECTED_JOURNAL_DRAFT_PREFIX,
    guestDeviceStorage.DEVICE_JOURNAL_DRAFT_PREFIX,
  ],
  [
    guestDeviceStorage.PROTECTED_JOURNAL_DRAFTS_CLEARED_KEY,
    guestDeviceStorage.DEVICE_JOURNAL_DRAFTS_CLEARED_KEY,
  ],
  [
    guestDeviceStorage.PROTECTED_RHYTHM_STORAGE_KEY,
    guestDeviceStorage.DEVICE_RHYTHM_STORAGE_KEY,
  ],
  [
    guestDeviceStorage.PROTECTED_GAME_STORAGE_KEY,
    guestDeviceStorage.DEVICE_GAME_STORAGE_KEY,
  ],
  [
    guestDeviceStorage.PROTECTED_SEVEN_DAYS_STORAGE_KEY,
    guestDeviceStorage.DEVICE_SEVEN_DAYS_STORAGE_KEY,
  ],
  [
    guestDeviceStorage.PROTECTED_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
    guestDeviceStorage.DEVICE_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
  ],
  [
    guestDeviceStorage.PROTECTED_ARCADE_BOOST_STORAGE_KEY,
    guestDeviceStorage.DEVICE_ARCADE_BOOST_STORAGE_KEY,
  ],
  [
    guestDeviceStorage.PROTECTED_AVATAR_DATABASE_NAME,
    guestDeviceStorage.DEVICE_AVATAR_DATABASE_NAME,
  ],
] as const;

/** Lists local-data consumers that must stay behind the neutral import boundary. */
const DEVICE_PRIVATE_CONSUMERS = [
  "src/lib/appearance/bootstrap.ts",
  "src/lib/games/arcade/boosts.ts",
  "src/lib/games/seven-days/progress.ts",
  "src/lib/games/seven-days/tutorial.ts",
  "src/lib/games/storage.ts",
  "src/lib/questos/journal-drafts.ts",
  "src/lib/questos/store.ts",
  "src/lib/rhythm/client.ts",
  "src/lib/utils/avatar.ts",
] as const;

/** Creates a minimal observable storage surface for device-local behavior. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("device-private storage adapters", () => {
  it("preserves every canonical value and function by exact alias", () => {
    for (const [actual, reviewed] of CANONICAL_STORAGE_ALIASES) {
      expect(actual).toBe(reviewed);
    }
    for (const [actual, reviewed] of CANONICAL_FUNCTION_ALIASES) {
      expect(actual).toBe(reviewed);
    }
    expect(Object.keys(guestDeviceStorage).sort()).toEqual(
      Object.keys(deviceStorage).sort(),
    );
    expect(Object.keys(guestDeviceWrite).sort()).toEqual(
      Object.keys(deviceWrite).sort(),
    );
  });

  it("keeps guest writes and removals local while refusing foreign authority", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);

    expect(guestDeviceStorage.readDevicePrivateStorageState(storage)).toBe(
      "legacy",
    );
    for (const [protectedName, deviceName] of GUEST_DEVICE_ONLY_ALIASES) {
      expect(protectedName).toBe(deviceName);
    }
    expect(
      guestDeviceStorage.selectDevicePrivateStorageKey(
        storage,
        guestDeviceStorage.DEVICE_JOURNEY_STORAGE_KEY,
        "ignored-protected-key",
      ),
    ).toBe(guestDeviceStorage.DEVICE_JOURNEY_STORAGE_KEY);

    const lease = guestDeviceWrite.captureDevicePrivateStorageReadLease(
      storage,
    );
    expect(lease).not.toBeNull();
    expect(
      await guestDeviceWrite.setDevicePrivateStorageItem(
        storage,
        guestDeviceStorage.DEVICE_JOURNEY_STORAGE_KEY,
        "local-fixture",
        false,
        lease,
      ),
    ).toBe(true);
    expect(storage.getItem(guestDeviceStorage.DEVICE_JOURNEY_STORAGE_KEY)).toBe(
      "local-fixture",
    );
    expect(
      await guestDeviceWrite.removeDevicePrivateStorageItem(
        storage,
        guestDeviceStorage.DEVICE_JOURNEY_STORAGE_KEY,
        false,
        "local-fixture",
        lease,
      ),
    ).toBe(true);
    expect(storage.getItem(guestDeviceStorage.DEVICE_JOURNEY_STORAGE_KEY)).toBe(
      null,
    );

    const foreignCallback = vi.fn(() => ({ value: true }));
    const forgedLease = {
      generation: "device",
    } as guestDeviceWrite.DevicePrivateReadLease;
    expect(
      guestDeviceWrite.devicePrivateInstallingReadAllowed(
        { unavailable: true },
        "fixture-user",
        storage,
      ),
    ).toBe(false);
    await expect(
      guestDeviceWrite.withDevicePrivateWriteGuard(foreignCallback, false, {
        expectedReadLease: forgedLease,
        readStorage: storage,
      }),
    ).resolves.toEqual({ committed: false });
    expect(foreignCallback).not.toHaveBeenCalled();
  });

  it("keeps guest adapters self-contained and local consumers neutral", () => {
    for (const path of [
      "src/native/guest/lib/storage/device-private-storage.ts",
      "src/native/guest/lib/storage/device-private-write.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/^\s*import\b/m);
      expect(source, path).not.toMatch(/\bimport\s*\(/);
      expect(source, path).not.toMatch(/\bfrom\s+["'][^"']+["']/);
    }

    for (const path of DEVICE_PRIVATE_CONSUMERS) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("/storage/device-private-");
      expect(source, path).not.toMatch(
        /\/storage\/web-private-(?:namespace|write)|\/supabase\/web-auth-storage/,
      );
    }

    for (const name of Object.keys(guestDeviceWrite)) {
      expect(name).not.toMatch(/account|auth|webPrivate/i);
    }
  });
});
