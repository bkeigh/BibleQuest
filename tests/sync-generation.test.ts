import { describe, expect, it } from "vitest";
import {
  accountSyncResetRequired,
  clearAccountSyncResetRequired,
  getAccountSyncGeneration,
  markAccountSyncResetRequired,
  setAccountSyncGeneration,
} from "@/lib/sync/generation";

/** Minimal in-memory storage keeps generation tests independent of the browser. */
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("account sync generation storage", () => {
  it("keeps independent monotonic server observations per account", () => {
    const storage = memoryStorage();
    const first = "71000000-0000-4000-8000-000000000001";
    const second = "72000000-0000-4000-8000-000000000002";

    setAccountSyncGeneration(first, 2, storage);
    setAccountSyncGeneration(second, 7, storage);
    setAccountSyncGeneration(first, 3, storage);

    expect(getAccountSyncGeneration(first, storage)).toBe(3);
    expect(getAccountSyncGeneration(second, storage)).toBe(7);
    expect(() => setAccountSyncGeneration(first, 2, storage)).toThrow(
      "Account sync generation cannot move backward.",
    );
  });

  it("rejects malformed values and ignores corrupt storage", () => {
    const storage = memoryStorage();
    const userId = "71000000-0000-4000-8000-000000000001";

    expect(() => setAccountSyncGeneration(userId, -1, storage)).toThrow(
      "Invalid account sync generation.",
    );
    storage.setItem("biblequest:account-sync-generation:v1", "not-json");
    expect(getAccountSyncGeneration(userId, storage)).toBeNull();
  });

  it("retains a reset latch until the remote baseline has been applied", () => {
    const storage = memoryStorage();
    const userId = "71000000-0000-4000-8000-000000000001";
    markAccountSyncResetRequired(userId, 4, storage);

    expect(getAccountSyncGeneration(userId, storage)).toBe(4);
    expect(accountSyncResetRequired(userId, storage)).toBe(true);
    setAccountSyncGeneration(userId, 5, storage);
    expect(accountSyncResetRequired(userId, storage)).toBe(true);

    clearAccountSyncResetRequired(userId, storage);
    expect(accountSyncResetRequired(userId, storage)).toBe(false);
    expect(getAccountSyncGeneration(userId, storage)).toBe(5);
  });
});
