import { beforeEach, describe, expect, it, vi } from "vitest";

const authBoundary = vi.hoisted(() => ({
  guard: null as { generation: string } | null,
  currentGeneration: null as string | null,
  removalContext: null as object | null,
  removalMode: "none" as "active-reset" | "none" | "terminal",
  withLock: vi.fn(async <T>(operation: () => Promise<T>) => operation()),
}));

vi.mock("@/lib/platform/target", () => ({ isNativeTarget: () => false }));
vi.mock("@/lib/supabase/web-auth-storage", () => ({
  beginReviewedWebPrivateRemoval: () =>
    authBoundary.removalMode === "none"
      ? null
      : { context: authBoundary.removalContext },
  beginWebPrivateWrite: () => authBoundary.guard,
  webPrivateRemovalGuardIsCurrent: (guard: { context: object }) =>
    guard.context === authBoundary.removalContext,
  webPrivateWriteGuardIsCurrent: (guard: { generation: string }) =>
    guard.generation === authBoundary.currentGeneration,
  withWebAuthStorageLock: authBoundary.withLock,
}));

import {
  removeWebPrivateStorageItem,
  setWebPrivateStorageItem,
} from "@/lib/storage/web-private-write";

/** Supplies the exact localStorage surface needed by the guarded helpers. */
class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  // Exercise the real web path instead of the DOM-less unit-fixture shortcut.
  vi.stubGlobal("document", {});
  authBoundary.guard = null;
  authBoundary.currentGeneration = null;
  authBoundary.removalContext = {};
  authBoundary.removalMode = "none";
  authBoundary.withLock.mockClear();
  authBoundary.withLock.mockImplementation(
    async <T>(operation: () => Promise<T>) => operation(),
  );
});

describe("web private mutation authorization", () => {
  it.each(["active-reset", "terminal"] as const)(
    "allows an exact reviewed %s removal under the shared lock",
    async (removalMode) => {
      const storage = new MemoryStorage();
      storage.setItem("private", "owner-a");
      authBoundary.removalMode = removalMode;

      await expect(
        removeWebPrivateStorageItem(storage, "private"),
      ).resolves.toBe(true);
      expect(storage.getItem("private")).toBeNull();
      expect(authBoundary.withLock).toHaveBeenCalledOnce();
    },
  );

  it("denies removal outside ordinary or reviewed authority", async () => {
    const storage = new MemoryStorage();
    storage.setItem("private", "owner-b");

    await expect(
      removeWebPrivateStorageItem(storage, "private"),
    ).resolves.toBe(false);
    expect(storage.getItem("private")).toBe("owner-b");
  });

  it("keeps writes closed during reviewed removal authority", async () => {
    const storage = new MemoryStorage();
    storage.setItem("private", "owner-a");
    authBoundary.removalMode = "terminal";

    await expect(
      setWebPrivateStorageItem(storage, "private", "new-value"),
    ).resolves.toBe(false);
    expect(storage.getItem("private")).toBe("owner-a");
  });

  it("restores an ordinary removal whose generation becomes stale", async () => {
    const storage = new MemoryStorage();
    storage.setItem("private", "owner-a");
    authBoundary.guard = { generation: "generation-a" };
    authBoundary.currentGeneration = "generation-b";

    await expect(
      removeWebPrivateStorageItem(storage, "private"),
    ).resolves.toBe(false);
    expect(storage.getItem("private")).toBe("owner-a");
  });

  it("denies an old write queued before a new account generation", async () => {
    const storage = new MemoryStorage();
    storage.setItem("private", "owner-b");
    authBoundary.guard = { generation: "generation-a" };
    authBoundary.currentGeneration = "generation-a";
    let release!: () => void;
    const queued = new Promise<void>((resolve) => {
      release = resolve;
    });
    authBoundary.withLock.mockImplementationOnce(
      async <T>(operation: () => Promise<T>) => {
        await queued;
        return operation();
      },
    );

    const staleWrite = setWebPrivateStorageItem(
      storage,
      "private",
      "owner-a-value",
    );
    authBoundary.guard = { generation: "generation-b" };
    authBoundary.currentGeneration = "generation-b";
    release();

    await expect(staleWrite).resolves.toBe(false);
    expect(storage.getItem("private")).toBe("owner-b");
  });

  it("denies a reviewed removal queued for a replaced reset context", async () => {
    const storage = new MemoryStorage();
    storage.setItem("private", "owner-b");
    authBoundary.removalMode = "terminal";
    const contextA = {};
    authBoundary.removalContext = contextA;
    let release!: () => void;
    const queued = new Promise<void>((resolve) => {
      release = resolve;
    });
    authBoundary.withLock.mockImplementationOnce(
      async <T>(operation: () => Promise<T>) => {
        await queued;
        return operation();
      },
    );

    const staleRemoval = removeWebPrivateStorageItem(storage, "private");
    authBoundary.removalContext = {};
    release();

    await expect(staleRemoval).resolves.toBe(false);
    expect(storage.getItem("private")).toBe("owner-b");
  });
});
