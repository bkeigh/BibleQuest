import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const ACCOUNT_BETA = "NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED";
const KEY = "biblequest:v1";
const OWNER_KEY = "biblequest:last-sync-user";

/** Stands in for the app's Documents directory. */
const disk = new Map<string, string>();
let writeFailure: Error | null = null;
let deleteFailure: Error | null = null;
let readFailure: Error | null = null;
let readBarrier: Promise<void> | null = null;

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      if (writeFailure) throw writeFailure;
      disk.set(path, data);
    }),
    readFile: vi.fn(async ({ path }: { path: string }) => {
      if (readBarrier) await readBarrier;
      if (readFailure) throw readFailure;
      const data = disk.get(path);
      if (data === undefined) {
        throw Object.assign(new Error("File does not exist"), {
          code: "OS-PLUG-FILE-0008",
        });
      }
      return { data };
    }),
    deleteFile: vi.fn(async ({ path }: { path: string }) => {
      if (deleteFailure) throw deleteFailure;
      disk.delete(path);
    }),
  },
}));

class MemoryStorage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

async function load() {
  vi.resetModules();
  return import("@/lib/native/journey-backup");
}

const JOURNEY = JSON.stringify({
  state: { prayers: [{ id: "1", text: "private" }] },
  version: 18,
});

beforeEach(() => {
  disk.clear();
  writeFailure = null;
  deleteFailure = null;
  readFailure = null;
  readBarrier = null;
  const storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    // Delegated lazily, not bound: vi.useFakeTimers() swaps the globals after
    // this stub is installed, and a bound reference would keep the real ones.
    setTimeout: (...args: Parameters<typeof globalThis.setTimeout>) =>
      globalThis.setTimeout(...args),
    clearTimeout: (...args: Parameters<typeof globalThis.clearTimeout>) =>
      globalThis.clearTimeout(...args),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  process.env[PLATFORM] = "native";
});

afterEach(() => {
  delete process.env[PLATFORM];
  delete process.env[ACCOUNT_BETA];
  vi.unstubAllGlobals();
});

describe("journey backup on native", () => {
  it("mirrors a journey to the filesystem", async () => {
    const { writeJourneyBackup, readJourneyBackup } = await load();
    localStorage.setItem(KEY, JOURNEY);

    expect(await writeJourneyBackup()).toBe(true);
    expect(disk.get("journey-backup.json")).toBe(JOURNEY);
    expect(await readJourneyBackup()).toBe(JOURNEY);
  });

  it("restores the journey when localStorage has been evicted", async () => {
    const first = await load();
    localStorage.setItem(KEY, JOURNEY);
    await first.writeJourneyBackup();

    // iOS reclaims WebView storage; the app relaunches with nothing.
    localStorage.clear();
    expect(localStorage.getItem(KEY)).toBeNull();

    const { restoreJourneyIfEvicted } = await load();
    expect(await restoreJourneyIfEvicted()).toBe("restored");
    expect(localStorage.getItem(KEY)).toBe(JOURNEY);
  });

  it("never overwrites a journey that is still present", async () => {
    const first = await load();
    localStorage.setItem(KEY, JOURNEY);
    await first.writeJourneyBackup();

    const newer = JSON.stringify({ state: { prayers: [] }, version: 19 });
    localStorage.setItem(KEY, newer);

    const { restoreJourneyIfEvicted } = await load();
    expect(await restoreJourneyIfEvicted()).toBe("primary-intact");
    expect(localStorage.getItem(KEY)).toBe(newer);
  });

  it("reports no-backup on a genuine first launch", async () => {
    const { restoreJourneyIfEvicted } = await load();
    expect(await restoreJourneyIfEvicted()).toBe("no-backup");
  });

  it("fails closed on a transient filesystem read error", async () => {
    const { restoreJourneyIfEvicted, writeJourneyBackup } = await load();
    readFailure = new Error("filesystem temporarily unavailable");

    expect(await restoreJourneyIfEvicted()).toBe("failed");
    localStorage.setItem(KEY, JOURNEY);
    expect(await writeJourneyBackup()).toBe(false);
  });

  it("refuses to restore a corrupt mirror over an empty primary", async () => {
    const { restoreJourneyIfEvicted } = await load();
    disk.set("journey-backup.json", "{ truncated");

    expect(await restoreJourneyIfEvicted()).toBe("failed");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("does not mirror an absent or empty journey", async () => {
    const { writeJourneyBackup } = await load();
    expect(await writeJourneyBackup()).toBe(false);

    localStorage.setItem(KEY, "{}");
    expect(await writeJourneyBackup()).toBe(false);
  });

  it("survives a filesystem write failure without throwing", async () => {
    const { writeJourneyBackup } = await load();
    localStorage.setItem(KEY, JOURNEY);
    writeFailure = new Error("disk full");

    // A safety net that fails must never take the app down with it.
    await expect(writeJourneyBackup()).resolves.toBe(false);
  });

  it("purges the filesystem mirror before allowing backups to resume", async () => {
    const {
      purgeJourneyBackup,
      readJourneyBackup,
      resumeJourneyBackupAfterPurge,
      writeJourneyBackup,
    } = await load();
    localStorage.setItem(KEY, JOURNEY);
    await writeJourneyBackup();

    expect(await purgeJourneyBackup()).toBe(true);
    expect(await readJourneyBackup()).toBeNull();
    expect(await writeJourneyBackup()).toBe(false);

    // Settings resets the primary before reopening the write-through mirror.
    localStorage.removeItem(KEY);
    resumeJourneyBackupAfterPurge();
    expect(await writeJourneyBackup()).toBe(false);
    expect(await readJourneyBackup()).toBeNull();
  });

  it("leaves a non-restorable tombstone when native deletion fails", async () => {
    const {
      purgeJourneyBackup,
      readJourneyBackup,
      restoreJourneyIfEvicted,
      resumeJourneyBackupAfterPurge,
      writeJourneyBackup,
    } = await load();
    localStorage.setItem(KEY, JOURNEY);
    await writeJourneyBackup();
    deleteFailure = new Error("delete denied");

    expect(await purgeJourneyBackup()).toBe(true);
    expect(disk.get("journey-backup.json")).toBe("{}");
    expect(await readJourneyBackup()).toBeNull();

    localStorage.removeItem(KEY);
    resumeJourneyBackupAfterPurge();
    expect(await restoreJourneyIfEvicted()).toBe("no-backup");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("reports a failed tombstone write and reopens normal mirroring", async () => {
    const {
      purgeJourneyBackup,
      readJourneyBackup,
      writeJourneyBackup,
    } = await load();
    localStorage.setItem(KEY, JOURNEY);
    await writeJourneyBackup();
    writeFailure = new Error("disk full");

    expect(await purgeJourneyBackup()).toBe(false);
    writeFailure = null;
    expect(await writeJourneyBackup()).toBe(true);
    expect(await readJourneyBackup()).toBe(JOURNEY);
  });

  it("invalidates a stale write that was queued before the purge", async () => {
    const {
      purgeJourneyBackup,
      readJourneyBackup,
      resumeJourneyBackupAfterPurge,
      writeJourneyBackup,
    } = await load();
    localStorage.setItem(KEY, JOURNEY);

    const staleWrite = writeJourneyBackup();
    const purge = purgeJourneyBackup();
    expect(await staleWrite).toBe(false);
    expect(await purge).toBe(true);
    expect(await readJourneyBackup()).toBeNull();

    localStorage.removeItem(KEY);
    resumeJourneyBackupAfterPurge();
  });

  it("mirrors subsequent store writes through the patched setItem", async () => {
    vi.useFakeTimers();
    const { startJourneyBackup, readJourneyBackup } = await load();
    const stop = startJourneyBackup();

    localStorage.setItem(KEY, JOURNEY);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await readJourneyBackup()).toBe(JOURNEY);

    stop();
    // After cleanup the original setItem is restored and writes stop mirroring.
    const later = JSON.stringify({ state: { prayers: [] }, version: 20 });
    localStorage.setItem(KEY, later);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await readJourneyBackup()).toBe(JOURNEY);
    vi.useRealTimers();
  });
});

describe("account-beta protected journey ownership", () => {
  it("never overwrites a newer owner established during a filesystem read", async () => {
    process.env[ACCOUNT_BETA] = "true";
    const first = await load();
    const { readLocalJourneyOwner, setLastSyncedUserId } = await import(
      "@/lib/sync/last-user"
    );
    localStorage.setItem(KEY, JOURNEY);
    setLastSyncedUserId("account-a");
    expect(await first.sealJourneyBackupOwner("account-a")).toBe(true);
    localStorage.clear();

    let releaseRead!: () => void;
    readBarrier = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const { restoreJourneyIfEvicted } = await load();
    const restoring = restoreJourneyIfEvicted();
    const newer = JSON.stringify({ state: { prayers: [] }, version: 20 });
    localStorage.setItem(KEY, newer);
    setLastSyncedUserId("account-b");
    releaseRead();

    expect(await restoring).toBe("primary-intact");
    expect(localStorage.getItem(KEY)).toBe(newer);
    expect(readLocalJourneyOwner()).toEqual({
      status: "owned",
      userId: "account-b",
    });
  });

  it("restores an evicted account journey with its owner before B can adopt it", async () => {
    process.env[ACCOUNT_BETA] = "true";
    const { restoreJourneyIfEvicted, sealJourneyBackupOwner } = await load();
    const { localDataBelongsToOtherUser, readLocalJourneyOwner, setLastSyncedUserId } =
      await import("@/lib/sync/last-user");
    localStorage.setItem(KEY, JOURNEY);
    setLastSyncedUserId("account-a");

    expect(await sealJourneyBackupOwner("account-a")).toBe(true);
    expect(JSON.parse(disk.get("journey-backup.json") ?? "{}")).toMatchObject({
      kind: "biblequest-native-journey-backup",
      version: 1,
      ownerUserId: "account-a",
    });
    localStorage.clear();

    expect(await restoreJourneyIfEvicted()).toBe("restored");
    expect(localStorage.getItem(KEY)).toBe(JOURNEY);
    expect(readLocalJourneyOwner()).toEqual({
      status: "owned",
      userId: "account-a",
    });
    expect(localDataBelongsToOtherUser("account-b")).toBe(true);
  });

  it("repairs a selectively evicted owner only for the identical protected body", async () => {
    process.env[ACCOUNT_BETA] = "true";
    const { restoreJourneyIfEvicted, sealJourneyBackupOwner } = await load();
    const { readLocalJourneyOwner, setLastSyncedUserId } = await import(
      "@/lib/sync/last-user"
    );
    localStorage.setItem(KEY, JOURNEY);
    setLastSyncedUserId("account-a");
    expect(await sealJourneyBackupOwner("account-a")).toBe(true);

    localStorage.removeItem(OWNER_KEY);
    expect(await restoreJourneyIfEvicted()).toBe("primary-intact");
    expect(readLocalJourneyOwner()).toEqual({
      status: "owned",
      userId: "account-a",
    });
  });

  it("keeps a pre-beta raw guest backup compatible and genuinely unowned", async () => {
    process.env[ACCOUNT_BETA] = "true";
    disk.set("journey-backup.json", JOURNEY);
    const { restoreJourneyIfEvicted } = await load();
    const { localDataBelongsToOtherUser, readLocalJourneyOwner } = await import(
      "@/lib/sync/last-user"
    );

    expect(await restoreJourneyIfEvicted()).toBe("restored");
    expect(readLocalJourneyOwner()).toEqual({ status: "unowned" });
    expect(localDataBelongsToOtherUser("account-b")).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["corrupt", " account-a\n"],
  ])("quarantines an account envelope with a %s owner", async (_label, owner) => {
    process.env[ACCOUNT_BETA] = "true";
    const envelope: Record<string, unknown> = {
      kind: "biblequest-native-journey-backup",
      version: 1,
      journey: JSON.parse(JOURNEY),
    };
    if (owner !== undefined) envelope.ownerUserId = owner;
    disk.set("journey-backup.json", JSON.stringify(envelope));
    const { readJourneyBackup, restoreJourneyIfEvicted, writeJourneyBackup } =
      await load();
    const { localDataBelongsToOtherUser, readLocalJourneyOwner } = await import(
      "@/lib/sync/last-user"
    );

    expect(await restoreJourneyIfEvicted()).toBe("failed");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(await readJourneyBackup()).toBeNull();
    expect(readLocalJourneyOwner()).toMatchObject({ status: "unavailable" });
    expect(localDataBelongsToOtherUser("account-b")).toBe(true);

    localStorage.setItem(KEY, JOURNEY);
    expect(await writeJourneyBackup()).toBe(false);
  });

  it("preserves the account envelope and owner when its purge tombstone fails", async () => {
    process.env[ACCOUNT_BETA] = "true";
    const {
      purgeJourneyBackup,
      readJourneyBackup,
      restoreJourneyIfEvicted,
      sealJourneyBackupOwner,
    } = await load();
    const { readLocalJourneyOwner, setLastSyncedUserId } = await import(
      "@/lib/sync/last-user"
    );
    localStorage.setItem(KEY, JOURNEY);
    setLastSyncedUserId("account-a");
    expect(await sealJourneyBackupOwner("account-a")).toBe(true);

    writeFailure = new Error("disk full");
    expect(await purgeJourneyBackup()).toBe(false);
    writeFailure = null;
    expect(await readJourneyBackup()).toBe(JOURNEY);
    expect(readLocalJourneyOwner()).toEqual({
      status: "owned",
      userId: "account-a",
    });

    localStorage.clear();
    expect(await restoreJourneyIfEvicted()).toBe("restored");
    expect(readLocalJourneyOwner()).toEqual({
      status: "owned",
      userId: "account-a",
    });
  });
});

describe("journey backup on web", () => {
  it("is inert — no plugin load, no file, no restore", async () => {
    process.env[PLATFORM] = "web";
    const {
      purgeJourneyBackup,
      writeJourneyBackup,
      restoreJourneyIfEvicted,
      startJourneyBackup,
    } = await load();
    localStorage.setItem(KEY, JOURNEY);

    expect(await writeJourneyBackup()).toBe(false);
    expect(await restoreJourneyIfEvicted()).toBe("not-native");
    expect(await purgeJourneyBackup()).toBe(true);
    expect(disk.size).toBe(0);

    const setItem = localStorage.setItem;
    const stop = startJourneyBackup();
    expect(localStorage.setItem).toBe(setItem);
    stop();
  });
});
