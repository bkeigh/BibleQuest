import { describe, expect, it } from "vitest";
import {
  accountSyncResetRequired,
  clearAccountSyncResetRequired,
  clearStoredAccountSyncGenerations,
  getAccountSyncGeneration,
  markAccountSyncResetRequired,
  removeStoredAccountSyncGeneration,
  setAccountSyncGeneration,
} from "@/lib/sync/generation";

/** Minimal in-memory storage keeps generation tests independent of the browser. */
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("account sync generation storage", () => {
  it("keeps independent monotonic server observations per account", async () => {
    const storage = memoryStorage();
    const first = "71000000-0000-4000-8000-000000000001";
    const second = "72000000-0000-4000-8000-000000000002";

    await expect(setAccountSyncGeneration(first, 2, storage)).resolves.toBe(true);
    await expect(setAccountSyncGeneration(second, 7, storage)).resolves.toBe(true);
    await expect(setAccountSyncGeneration(first, 3, storage)).resolves.toBe(true);

    expect(getAccountSyncGeneration(first, storage)).toBe(3);
    expect(getAccountSyncGeneration(second, storage)).toBe(7);
    await expect(setAccountSyncGeneration(first, 2, storage)).resolves.toBe(false);
  });

  it("rejects malformed values and ignores corrupt storage", async () => {
    const storage = memoryStorage();
    const userId = "71000000-0000-4000-8000-000000000001";

    await expect(setAccountSyncGeneration(userId, -1, storage)).rejects.toThrow(
      "Invalid account sync generation.",
    );
    storage.setItem("biblequest:account-sync-generation:v1", "not-json");
    expect(getAccountSyncGeneration(userId, storage)).toBeNull();
    await expect(
      setAccountSyncGeneration(userId, 2, storage),
    ).resolves.toBe(false);
    expect(storage.getItem("biblequest:account-sync-generation:v1")).toBe(
      "not-json",
    );
  });

  it("retains a reset latch until the remote baseline has been applied", async () => {
    const storage = memoryStorage();
    const userId = "71000000-0000-4000-8000-000000000001";
    await expect(
      markAccountSyncResetRequired(userId, 4, storage),
    ).resolves.toBe(true);

    expect(getAccountSyncGeneration(userId, storage)).toBe(4);
    expect(accountSyncResetRequired(userId, storage)).toBe(true);
    await expect(setAccountSyncGeneration(userId, 5, storage)).resolves.toBe(true);
    expect(accountSyncResetRequired(userId, storage)).toBe(true);

    await expect(clearAccountSyncResetRequired(userId, storage)).resolves.toBe(true);
    expect(accountSyncResetRequired(userId, storage)).toBe(false);
    expect(getAccountSyncGeneration(userId, storage)).toBe(5);
  });

  it("removes retained account metadata with a deleted device journey", async () => {
    const storage = memoryStorage();
    const first = "71000000-0000-4000-8000-000000000001";
    const second = "72000000-0000-4000-8000-000000000002";
    await setAccountSyncGeneration(first, 2, storage);
    await setAccountSyncGeneration(second, 7, storage);

    await expect(clearStoredAccountSyncGenerations(storage)).resolves.toBe(true);

    expect(getAccountSyncGeneration(first, storage)).toBeNull();
    expect(getAccountSyncGeneration(second, storage)).toBeNull();
  });

  it("removes only the deleted account from a multi-account ledger", async () => {
    const storage = memoryStorage();
    const first = "71000000-0000-4000-8000-000000000001";
    const second = "72000000-0000-4000-8000-000000000002";
    await markAccountSyncResetRequired(first, 2, storage);
    await markAccountSyncResetRequired(second, 7, storage);

    await expect(
      removeStoredAccountSyncGeneration(first, storage),
    ).resolves.toBe(true);

    expect(getAccountSyncGeneration(first, storage)).toBeNull();
    expect(accountSyncResetRequired(first, storage)).toBe(false);
    expect(getAccountSyncGeneration(second, storage)).toBe(7);
    expect(accountSyncResetRequired(second, storage)).toBe(true);
  });
});
