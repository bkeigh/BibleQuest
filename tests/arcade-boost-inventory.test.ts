import { describe, expect, it, vi } from "vitest";
import {
  BOOST_IDS,
  BOOST_STORAGE_KEY,
  EMPTY_INVENTORY,
  grantBoost,
  hasAnyBoost,
  readInventory,
  sanitizeInventory,
  spendBoost,
  writeInventory,
  type BoostInventory,
} from "@/lib/games/arcade/boosts";

class MemoryStorage implements Storage {
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

function failingStorage(): Storage {
  const storage = new MemoryStorage();
  storage.getItem = () => {
    throw new Error("denied");
  };
  storage.setItem = () => {
    throw new Error("quota");
  };
  return storage;
}

describe("sanitizeInventory", () => {
  it("fills every known boost from a partial record", () => {
    expect(sanitizeInventory({ hint: 2 })).toEqual({
      ...EMPTY_INVENTORY,
      hint: 2,
    });
    expect(sanitizeInventory({})).toEqual(EMPTY_INVENTORY);
  });

  it("rejects anything that is not a plain count", () => {
    expect(sanitizeInventory(null)).toBeNull();
    expect(sanitizeInventory("hint")).toBeNull();
    expect(sanitizeInventory({ hint: 1.5 })).toBeNull();
    expect(sanitizeInventory({ hint: Number.NaN })).toBeNull();
    expect(sanitizeInventory({ hint: "2" })).toBeNull();
    expect(sanitizeInventory({ hint: 100 })).toBeNull();
    expect(sanitizeInventory({ hint: 99 })).toEqual({
      ...EMPTY_INVENTORY,
      hint: 99,
    });
  });
});

describe("readInventory and writeInventory", () => {
  it("round-trips a sanitized inventory", async () => {
    const storage = new MemoryStorage();
    const inventory = grantBoost(EMPTY_INVENTORY, "gather", 3);
    await expect(writeInventory(inventory, storage)).resolves.toBe(true);
    expect(readInventory(storage)).toEqual(inventory);
  });

  it("starts empty on a device that has never played", () => {
    expect(readInventory(new MemoryStorage())).toEqual(EMPTY_INVENTORY);
  });

  it("drops and forgets a tampered or unreadable record", async () => {
    const storage = new MemoryStorage();
    storage.setItem(BOOST_STORAGE_KEY, JSON.stringify({ "level-skip": 5 }));
    expect(readInventory(storage)).toEqual(EMPTY_INVENTORY);
    await vi.waitFor(() =>
      expect(storage.getItem(BOOST_STORAGE_KEY)).toBeNull(),
    );

    storage.setItem(BOOST_STORAGE_KEY, "{not json");
    expect(readInventory(storage)).toEqual(EMPTY_INVENTORY);
  });

  it("refuses to persist an inventory it would not accept back", async () => {
    const storage = new MemoryStorage();
    await expect(
      writeInventory({ hint: -1 } as unknown as BoostInventory, storage),
    ).resolves.toBe(false);
    expect(storage.getItem(BOOST_STORAGE_KEY)).toBeNull();
  });

  it("degrades to no boosts when storage throws or is unavailable", async () => {
    const storage = failingStorage();
    expect(readInventory(storage)).toEqual(EMPTY_INVENTORY);
    await expect(writeInventory(EMPTY_INVENTORY, storage)).resolves.toBe(false);

    vi.stubGlobal("window", undefined);
    expect(readInventory()).toEqual(EMPTY_INVENTORY);
    await expect(writeInventory(EMPTY_INVENTORY)).resolves.toBe(false);
    vi.unstubAllGlobals();
  });

  it("uses window.localStorage when no storage is passed", async () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    await expect(
      writeInventory(grantBoost(EMPTY_INVENTORY, "hint")),
    ).resolves.toBe(true);
    expect(readInventory().hint).toBe(1);
    vi.unstubAllGlobals();
  });

  it("survives a browser that throws on localStorage access", async () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked in private mode");
      },
    });
    expect(readInventory()).toEqual(EMPTY_INVENTORY);
    await expect(writeInventory(EMPTY_INVENTORY)).resolves.toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("grantBoost, spendBoost, hasAnyBoost", () => {
  it("grants without mutating the previous inventory", () => {
    const granted = grantBoost(EMPTY_INVENTORY, "hint", 2);
    expect(granted.hint).toBe(2);
    expect(EMPTY_INVENTORY.hint).toBe(0);
    expect(grantBoost(granted, "hint").hint).toBe(3);
  });

  it("clamps a grant to the per-boost ceiling and ignores negative counts", () => {
    expect(grantBoost(EMPTY_INVENTORY, "gather", 500).gather).toBe(99);
    expect(grantBoost(EMPTY_INVENTORY, "gather", -5).gather).toBe(0);
  });

  it("spends one at a time and refuses when there is none", () => {
    const inventory = grantBoost(EMPTY_INVENTORY, "extra-moves", 2);
    const once = spendBoost(inventory, "extra-moves");
    expect(once?.["extra-moves"]).toBe(1);
    expect(spendBoost(once as BoostInventory, "extra-moves")?.["extra-moves"]).toBe(0);
    expect(spendBoost(EMPTY_INVENTORY, "extra-moves")).toBeNull();
    expect(inventory["extra-moves"]).toBe(2);
  });

  it("reports whether any boost is held", () => {
    expect(hasAnyBoost(EMPTY_INVENTORY)).toBe(false);
    for (const id of BOOST_IDS) {
      expect(hasAnyBoost(grantBoost(EMPTY_INVENTORY, id))).toBe(true);
    }
  });
});
