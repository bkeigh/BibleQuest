import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LAST_SYNC_USER_STORAGE_KEY,
  LOCAL_JOURNEY_OWNER_QUARANTINE,
  LocalJourneyOwnershipError,
  getLastSyncedUserId,
  localDataBelongsToOtherUser,
  readLocalJourneyOwner,
  setLastSyncedUserId,
} from "@/lib/sync/last-user";

class OwnerStorage {
  readonly values = new Map<string, string>();
  throwOnGet = false;
  throwOnSet = false;
  ignoreWrites = false;

  getItem(key: string) {
    if (this.throwOnGet) throw new Error("storage denied");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.throwOnSet) throw new Error("quota exceeded");
    if (!this.ignoreWrites) this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("local journey ownership boundary", () => {
  it("distinguishes a genuinely unowned journey from an exact owner", () => {
    const storage = new OwnerStorage();
    expect(readLocalJourneyOwner(storage)).toEqual({ status: "unowned" });

    setLastSyncedUserId("account-a", storage);

    expect(readLocalJourneyOwner(storage)).toEqual({
      status: "owned",
      userId: "account-a",
    });
  });

  it("fails closed when reading localStorage throws", () => {
    const storage = new OwnerStorage();
    storage.throwOnGet = true;
    vi.stubGlobal("window", { localStorage: storage });

    expect(readLocalJourneyOwner()).toEqual({
      status: "unavailable",
      reason: "storage",
    });
    expect(getLastSyncedUserId()).toBe(LOCAL_JOURNEY_OWNER_QUARANTINE);
    expect(localDataBelongsToOtherUser("account-b")).toBe(true);
  });

  it("treats a malformed owner as unavailable rather than guest", () => {
    const storage = new OwnerStorage();
    storage.values.set(LAST_SYNC_USER_STORAGE_KEY, " account-a\n");
    vi.stubGlobal("window", { localStorage: storage });

    expect(readLocalJourneyOwner()).toEqual({
      status: "unavailable",
      reason: "corrupt",
    });
    expect(localDataBelongsToOtherUser("account-b")).toBe(true);
  });

  it("rejects thrown and silently ignored owner writes", () => {
    const throwing = new OwnerStorage();
    throwing.throwOnSet = true;
    expect(() => setLastSyncedUserId("account-a", throwing)).toThrow(
      LocalJourneyOwnershipError,
    );

    const ignored = new OwnerStorage();
    ignored.ignoreWrites = true;
    expect(() => setLastSyncedUserId("account-a", ignored)).toThrow(
      LocalJourneyOwnershipError,
    );
    expect(readLocalJourneyOwner(ignored)).toEqual({ status: "unowned" });
  });
});
