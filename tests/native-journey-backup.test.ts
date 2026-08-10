import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const KEY = "biblequest:v1";

/** Stands in for the app's Documents directory. */
const disk = new Map<string, string>();
let writeFailure: Error | null = null;
let deleteFailure: Error | null = null;

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      if (writeFailure) throw writeFailure;
      disk.set(path, data);
    }),
    readFile: vi.fn(async ({ path }: { path: string }) => {
      const data = disk.get(path);
      if (data === undefined) throw new Error("File does not exist");
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
  vi.unstubAllGlobals();
});

describe("journey backup on native", () => {
  it("mirrors a journey to the filesystem", async () => {
    const { writeJourneyBackup, readJourneyBackup } = await load();
    localStorage.setItem(KEY, JOURNEY);

    expect(await writeJourneyBackup()).toBe(true);
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
