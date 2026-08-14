import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authBoundary = vi.hoisted(() => ({
  activeGuard: true,
  freshInstall: true,
  guestProvenance: true,
  installCutover: true,
  legacyGuestAuthorization: null as
    | "explicit-clear"
    | "explicit-keep"
    | "inspect"
    | null,
  legacyAbsenceAudit: true,
  removal: true,
  resetCommit: false,
  terminalRemoval: true,
  withLock: vi.fn(async <T>(operation: () => Promise<T>) => operation()),
}));

vi.mock("@/lib/supabase/web-auth-storage", () => ({
  beginWebPrivateWrite: () =>
    authBoundary.activeGuard ? { generation: "active" } : null,
  reviewedWebPrivateWriteRemovalAllowed: () => authBoundary.removal,
  terminalWebPrivateWriteRemovalAllowed: () =>
    authBoundary.terminalRemoval,
  webPrivateActiveResetCommitAllowed: () => authBoundary.resetCommit,
  webPrivateFreshInstallResetAllowed: () => authBoundary.freshInstall,
  webPrivateInstallCutoverAllowed: () => authBoundary.installCutover,
  webPrivateLegacyAbsenceAuditAllowed: () =>
    authBoundary.legacyAbsenceAudit,
  webPrivateLegacyGuestRecoveryAllowed: (authorization: string) =>
    authBoundary.legacyGuestAuthorization === authorization,
  webPrivateNeverOwnedGuestProvenanceAllowed: () =>
    authBoundary.guestProvenance,
  webPrivateWriteGuardIsCurrent: () => authBoundary.activeGuard,
  withWebAuthStorageLock: authBoundary.withLock,
}));

import {
  adoptAmbiguousLegacyWebPrivateDataAsGuest,
  classifyLegacyWebPrivateGuestRecovery,
  commitWebPrivateHandoffOwner,
  cutoverLegacyWebPrivateDataToV2,
  establishNeverOwnedWebPrivateGuestProvenance,
  purgeAmbiguousWebPrivateDataAndEstablishGuest,
  purgeAndCommitFreshWebPrivateInstall,
  proveAllWebPrivateDataNamespacesEmpty,
  removeAndProveLegacyWebPrivateResidue,
  readLegacyWebPrivateCutoverState,
  readWebPrivateHandoffCommitState,
  readWebPrivateSourceOwnerDisposition,
} from "@/lib/storage/web-private-cutover";
import {
  LEGACY_AVATAR_DATABASE_NAME,
  LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
  LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
  LEGACY_LAST_SYNC_USER_STORAGE_KEY,
  LEGACY_QUEST_JOURNEY_STORAGE_KEY,
  WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
  WEB_PRIVATE_CUTOVER_PREPARED,
  WEB_PRIVATE_CUTOVER_STAGING,
  WEB_PRIVATE_GUEST_CLEAR_IN_PROGRESS,
  WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY,
  WEB_PRIVATE_HANDOFF_CONTRACT_COMPLETE,
  WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
  WEB_PRIVATE_NAMESPACE_V2_MARKER,
  WEB_PRIVATE_NEVER_OWNED_VALUE,
  WEB_V2_AVATAR_DATABASE_NAME,
  WEB_V2_GUEST_PROVENANCE_STORAGE_KEY,
  WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY,
  WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY,
  WEB_V2_LAST_SYNC_USER_STORAGE_KEY,
  WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY,
  WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
  readWebPrivateGuestClearState,
  readWebPrivateNamespaceState,
} from "@/lib/storage/web-private-namespace";
import type { WebAccountOperationHandle } from "@/lib/supabase/web-auth-storage";

const EXPECTED_USER = "account-b";
const OTHER_USER = "account-a";
const WEB_OPERATION = {} as WebAccountOperationHandle;

/** Implements localStorage with deterministic crash and rewrite injection. */
class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  mutationCount = 0;
  mutations: Array<{ key: string; type: "remove" | "set" }> = [];
  throwAfterMutation: number | null = null;
  rewriteAfterRemove: string | null = null;
  throwOnRead = false;

  get length() {
    return this.values.size;
  }

  clear() {
    for (const key of [...this.values.keys()]) this.removeItem(key);
  }

  getItem(key: string) {
    if (this.throwOnRead) throw new Error("storage read unavailable");
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
    if (this.rewriteAfterRemove === key) this.values.set(key, "late-write");
    this.recordMutation("remove", key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
    this.recordMutation("set", key);
  }

  resetMutationLog() {
    this.mutationCount = 0;
    this.mutations = [];
  }

  private recordMutation(type: "remove" | "set", key: string) {
    this.mutationCount += 1;
    this.mutations.push({ key, type });
    if (this.mutationCount === this.throwAfterMutation) {
      throw new Error("simulated process interruption");
    }
  }
}

/** Installs one isolated browser storage and IndexedDB realm. */
function installBrowser(storage = new MemoryStorage()) {
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("indexedDB", new IDBFactory());
  return storage;
}

/** Opens the exact avatar store used by the production cache. */
function openAvatarDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("images")) {
        request.result.createObjectStore("images");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Writes one private avatar fixture and waits for its transaction commit. */
async function putAvatar(name: string, key: string, value: Blob) {
  const database = await openAvatarDatabase(name);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("images", "readwrite");
    transaction.objectStore("images").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

/** Reads one avatar fixture without creating an account-visible value. */
async function getAvatar(name: string, key: string): Promise<unknown> {
  const database = await openAvatarDatabase(name);
  const value = await new Promise<unknown>((resolve, reject) => {
    const request = database.transaction("images").objectStore("images").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return value;
}

/** Seeds the private source owner category without retaining test identifiers. */
function seedSourceDisposition(
  storage: MemoryStorage,
  namespace: "legacy" | "v2",
  disposition: "exact-owner" | "other-owner" | "unowned",
) {
  const ownerKey = namespace === "legacy"
    ? LEGACY_LAST_SYNC_USER_STORAGE_KEY
    : WEB_V2_LAST_SYNC_USER_STORAGE_KEY;
  const provenanceKey = namespace === "legacy"
    ? LEGACY_GUEST_PROVENANCE_STORAGE_KEY
    : WEB_V2_GUEST_PROVENANCE_STORAGE_KEY;
  if (disposition === "unowned") {
    storage.removeItem(ownerKey);
    storage.setItem(provenanceKey, WEB_PRIVATE_NEVER_OWNED_VALUE);
    return;
  }
  storage.removeItem(provenanceKey);
  storage.setItem(
    ownerKey,
    disposition === "exact-owner" ? EXPECTED_USER : OTHER_USER,
  );
}

beforeEach(() => {
  authBoundary.activeGuard = true;
  authBoundary.freshInstall = true;
  authBoundary.guestProvenance = true;
  authBoundary.installCutover = true;
  authBoundary.legacyGuestAuthorization = null;
  authBoundary.legacyAbsenceAudit = true;
  authBoundary.removal = true;
  authBoundary.resetCommit = false;
  authBoundary.terminalRemoval = true;
  authBoundary.withLock.mockClear();
  authBoundary.withLock.mockImplementation(
    async <T>(operation: () => Promise<T>) => operation(),
  );
  installBrowser();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web private namespace decision", () => {
  it("distinguishes genuine legacy, interrupted, corrupt, and committed state", () => {
    const storage = installBrowser();
    expect(readWebPrivateNamespaceState(storage)).toBe("legacy");

    storage.setItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY, WEB_PRIVATE_CUTOVER_STAGING);
    expect(readWebPrivateNamespaceState(storage)).toBe("unavailable");
    expect(readLegacyWebPrivateCutoverState(storage)).toBe("staging");

    storage.setItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY, "malformed");
    expect(readWebPrivateNamespaceState(storage)).toBe("unavailable");
    expect(readLegacyWebPrivateCutoverState(storage)).toBe("unavailable");

    storage.setItem(
      WEB_PRIVATE_NAMESPACE_V2_MARKER,
      WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
    );
    expect(readWebPrivateNamespaceState(storage)).toBe("v2");
    expect(readLegacyWebPrivateCutoverState(storage)).toBe("committed");

    storage.setItem(
      WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY,
      WEB_PRIVATE_GUEST_CLEAR_IN_PROGRESS,
    );
    expect(readWebPrivateGuestClearState(storage)).toBe("clearing");
    expect(readWebPrivateNamespaceState(storage)).toBe("unavailable");
    expect(readLegacyWebPrivateCutoverState(storage)).toBe("unavailable");
  });

  it("fails closed when marker storage is malformed or unreadable", () => {
    const storage = installBrowser();
    storage.setItem(WEB_PRIVATE_NAMESPACE_V2_MARKER, "almost-complete");
    expect(readWebPrivateNamespaceState(storage)).toBe("unavailable");
    storage.throwOnRead = true;
    expect(readWebPrivateNamespaceState(storage)).toBe("unavailable");
    expect(readLegacyWebPrivateCutoverState(storage)).toBe("unavailable");

    storage.throwOnRead = false;
    storage.removeItem(WEB_PRIVATE_NAMESPACE_V2_MARKER);
    storage.setItem(WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY, "malformed");
    expect(readWebPrivateGuestClearState(storage)).toBe("unavailable");
    expect(readWebPrivateNamespaceState(storage)).toBe("unavailable");
  });
});

describe("legacy private namespace cutover", () => {
  it("copies and verifies localStorage and IndexedDB before marker-last commit", async () => {
    const storage = installBrowser();
    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "journey-a");
    storage.setItem(
      `${LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX}:prayer:one`,
      "draft-a",
    );
    seedSourceDisposition(storage, "legacy", "exact-owner");
    const avatar = new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/webp",
    });
    await putAvatar(LEGACY_AVATAR_DATABASE_NAME, "avatar-a", avatar);
    storage.resetMutationLog();

    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("committed");

    expect(storage.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY)).toBe("journey-a");
    expect(
      storage.getItem(`${LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX}:prayer:one`),
    ).toBeNull();
    expect(await getAvatar(WEB_V2_AVATAR_DATABASE_NAME, "avatar-a")).toEqual(
      avatar,
    );
    expect(storage.mutations.at(-1)).toEqual({
      key: WEB_PRIVATE_NAMESPACE_V2_MARKER,
      type: "set",
    });
  });

  it.each([
    "unowned",
    "exact-owner",
    "other-owner",
  ] as const)(
    "derives %s source internally after prepared and marker-written crash boundaries",
    async (disposition) => {
      const storage = installBrowser();
      storage.setItem(
        WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
        WEB_PRIVATE_CUTOVER_PREPARED,
      );
      seedSourceDisposition(storage, "v2", disposition);

      await expect(
        readWebPrivateSourceOwnerDisposition(EXPECTED_USER, WEB_OPERATION),
      ).resolves.toBe(disposition);
      await expect(
        cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
      ).resolves.toBe("committed");
      await expect(
        readWebPrivateSourceOwnerDisposition(EXPECTED_USER, WEB_OPERATION),
      ).resolves.toBe(disposition);
      await expect(
        cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
      ).resolves.toBe("already-committed");
    },
  );

  it("restarts a partial staging copy idempotently", async () => {
    const storage = installBrowser();
    storage.setItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY, WEB_PRIVATE_CUTOVER_STAGING);
    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "canonical");
    storage.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "partial-stale-copy");
    seedSourceDisposition(storage, "legacy", "exact-owner");

    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("committed");
    expect(storage.getItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY)).toBe("canonical");
  });

  it("removes legacy bytes repopulated by an ed28 rollback before returning", async () => {
    const storage = installBrowser();
    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "original");
    seedSourceDisposition(storage, "legacy", "exact-owner");
    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("committed");

    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "rollback-write");
    storage.setItem(
      `${LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX}:reflection:rollback`,
      "rollback-draft",
    );
    await putAvatar(
      LEGACY_AVATAR_DATABASE_NAME,
      "rollback-avatar",
      new Blob([new Uint8Array([9])], { type: "image/webp" }),
    );

    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("already-committed");
    expect(storage.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY)).toBeNull();
    expect(
      storage.getItem(
        `${LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX}:reflection:rollback`,
      ),
    ).toBeNull();
    expect(storage.getItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY)).toBe("original");
    expect(
      (await indexedDB.databases()).some(
        (database) => database.name === LEGACY_AVATAR_DATABASE_NAME,
      ),
    ).toBe(false);
  });

  it("keeps marker unavailable when an uncooperating legacy writer wins readback", async () => {
    const storage = installBrowser();
    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "journey-a");
    seedSourceDisposition(storage, "legacy", "exact-owner");
    storage.rewriteAfterRemove = LEGACY_QUEST_JOURNEY_STORAGE_KEY;

    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("unavailable");
    expect(storage.getItem(WEB_PRIVATE_NAMESPACE_V2_MARKER)).toBeNull();
    expect(readWebPrivateNamespaceState(storage)).toBe("unavailable");
  });

  it("fails closed on absent IndexedDB, blocked deletion, or bounded resources", async () => {
    const noDatabaseStorage = installBrowser();
    seedSourceDisposition(noDatabaseStorage, "legacy", "exact-owner");
    vi.stubGlobal("indexedDB", undefined);
    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("unavailable");

    const blockedStorage = installBrowser();
    seedSourceDisposition(blockedStorage, "legacy", "exact-owner");
    const blockingDatabase = await openAvatarDatabase(
      LEGACY_AVATAR_DATABASE_NAME,
    );
    blockingDatabase.onversionchange = () => undefined;
    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("unavailable");
    blockingDatabase.close();

    const oversizedStorage = installBrowser();
    seedSourceDisposition(oversizedStorage, "legacy", "exact-owner");
    oversizedStorage.setItem(
      LEGACY_QUEST_JOURNEY_STORAGE_KEY,
      "x".repeat(5_000_001),
    );
    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("unavailable");

    const tooManyKeys = installBrowser();
    seedSourceDisposition(tooManyKeys, "legacy", "exact-owner");
    for (let index = 0; index < 513; index += 1) {
      tooManyKeys.setItem(`unrelated:${index}`, "x");
    }
    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("unavailable");

    const oversizedAvatarStorage = installBrowser();
    seedSourceDisposition(oversizedAvatarStorage, "legacy", "exact-owner");
    await putAvatar(
      LEGACY_AVATAR_DATABASE_NAME,
      "oversized",
      new Blob([new Uint8Array(1024 * 1024 + 1)], { type: "image/webp" }),
    );
    await expect(
      cutoverLegacyWebPrivateDataToV2(EXPECTED_USER, WEB_OPERATION),
    ).resolves.toBe("unavailable");
  });
});

describe("installed owner contract", () => {
  it("stays unavailable after every partial mutation and becomes ready only when complete", async () => {
    const baseline = installBrowser();
    baseline.setItem(
      WEB_PRIVATE_NAMESPACE_V2_MARKER,
      WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
    );
    baseline.resetMutationLog();
    await expect(
      commitWebPrivateHandoffOwner(WEB_OPERATION, EXPECTED_USER, true),
    ).resolves.toBe(true);
    const mutationCount = baseline.mutationCount;

    for (let interruptedAt = 1; interruptedAt <= mutationCount; interruptedAt += 1) {
      const storage = installBrowser();
      storage.setItem(
        WEB_PRIVATE_NAMESPACE_V2_MARKER,
        WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
      );
      storage.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, OTHER_USER);
      storage.resetMutationLog();
      storage.throwAfterMutation = interruptedAt;

      await commitWebPrivateHandoffOwner(
        WEB_OPERATION,
        EXPECTED_USER,
        true,
      );
      const state = await readWebPrivateHandoffCommitState(
        WEB_OPERATION,
        EXPECTED_USER,
      );
      if (state === "keep") {
        expect(storage.getItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY)).toBe(
          EXPECTED_USER,
        );
        expect(
          storage.getItem(WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY),
        ).toBe(EXPECTED_USER);
        expect(
          storage.getItem(WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY),
        ).toBe(EXPECTED_USER);
        expect(storage.getItem(WEB_V2_GUEST_PROVENANCE_STORAGE_KEY)).toBeNull();
      } else {
        expect(state).toBe("unavailable");
        expect(storage.getItem(WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY)).not.toBe(
          WEB_PRIVATE_HANDOFF_CONTRACT_COMPLETE,
        );
      }
    }
  });

  it("purges both namespaces and avatar databases before publishing fresh owner", async () => {
    const storage = installBrowser();
    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "legacy-a");
    storage.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "v2-a");
    storage.setItem(LEGACY_LAST_SYNC_USER_STORAGE_KEY, OTHER_USER);
    storage.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, OTHER_USER);
    await putAvatar(
      LEGACY_AVATAR_DATABASE_NAME,
      "legacy-avatar",
      new Blob([new Uint8Array([1])]),
    );
    await putAvatar(
      WEB_V2_AVATAR_DATABASE_NAME,
      "v2-avatar",
      new Blob([new Uint8Array([2])]),
    );

    await expect(
      purgeAndCommitFreshWebPrivateInstall(WEB_OPERATION, EXPECTED_USER),
    ).resolves.toBe(true);
    await expect(
      readWebPrivateHandoffCommitState(WEB_OPERATION, EXPECTED_USER),
    ).resolves.toBe("fresh");
    expect(storage.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_LAST_SYNC_USER_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY)).toBe(
      EXPECTED_USER,
    );
    expect(
      (await indexedDB.databases()).filter((database) =>
        [LEGACY_AVATAR_DATABASE_NAME, WEB_V2_AVATAR_DATABASE_NAME].includes(
          database.name ?? "",
        ),
      ),
    ).toEqual([]);
  });
});

describe("active v2 rollback residue audit", () => {
  it("removes and proves legacy localStorage and avatar residue before reads", async () => {
    const storage = installBrowser();
    storage.setItem(
      WEB_PRIVATE_NAMESPACE_V2_MARKER,
      WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
    );
    storage.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, EXPECTED_USER);
    storage.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "v2-canonical");
    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "rollback-residue");
    await putAvatar(
      LEGACY_AVATAR_DATABASE_NAME,
      "rollback-avatar",
      new Blob([new Uint8Array([1])]),
    );

    await expect(
      removeAndProveLegacyWebPrivateResidue(
        WEB_OPERATION,
        EXPECTED_USER,
      ),
    ).resolves.toBe(true);
    expect(storage.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY)).toBe(
      "v2-canonical",
    );
    expect(
      (await indexedDB.databases()).some(
        (database) => database.name === LEGACY_AVATAR_DATABASE_NAME,
      ),
    ).toBe(false);
  });

  it("fails closed when legacy residue rewrites or deletion is blocked", async () => {
    const rewritten = installBrowser();
    rewritten.setItem(
      WEB_PRIVATE_NAMESPACE_V2_MARKER,
      WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
    );
    rewritten.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, EXPECTED_USER);
    rewritten.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "rollback-residue");
    rewritten.rewriteAfterRemove = LEGACY_QUEST_JOURNEY_STORAGE_KEY;
    await expect(
      removeAndProveLegacyWebPrivateResidue(
        WEB_OPERATION,
        EXPECTED_USER,
      ),
    ).resolves.toBe(false);

    const blocked = installBrowser();
    blocked.setItem(
      WEB_PRIVATE_NAMESPACE_V2_MARKER,
      WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
    );
    blocked.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, EXPECTED_USER);
    const database = await openAvatarDatabase(LEGACY_AVATAR_DATABASE_NAME);
    database.onversionchange = () => undefined;
    await expect(
      removeAndProveLegacyWebPrivateResidue(
        WEB_OPERATION,
        EXPECTED_USER,
      ),
    ).resolves.toBe(false);
    database.close();
  });
});

describe("ambiguous missing-auth guest recovery", () => {
  it("classifies only bounded legacy bytes as ambiguous", async () => {
    const storage = installBrowser();
    authBoundary.legacyGuestAuthorization = "inspect";
    await expect(classifyLegacyWebPrivateGuestRecovery()).resolves.toBe(
      "empty-unproven",
    );

    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "ambiguous-journey");
    await expect(classifyLegacyWebPrivateGuestRecovery()).resolves.toBe(
      "ambiguous",
    );

    storage.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "unexplained-v2");
    await expect(classifyLegacyWebPrivateGuestRecovery()).resolves.toBe(
      "unavailable",
    );
  });

  it("classifies legacy avatar bytes without creating absent databases", async () => {
    installBrowser();
    authBoundary.legacyGuestAuthorization = "inspect";
    await putAvatar(
      LEGACY_AVATAR_DATABASE_NAME,
      "legacy-avatar",
      new Blob([new Uint8Array([1])]),
    );

    await expect(classifyLegacyWebPrivateGuestRecovery()).resolves.toBe(
      "ambiguous",
    );
    expect(
      (await indexedDB.databases()).some(
        (database) => database.name === WEB_V2_AVATAR_DATABASE_NAME,
      ),
    ).toBe(false);
  });

  it("keeps ambiguous legacy bytes only after explicit keep authority", async () => {
    const storage = installBrowser();
    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "keep-this-journey");
    authBoundary.legacyGuestAuthorization = "explicit-keep";

    await expect(
      adoptAmbiguousLegacyWebPrivateDataAsGuest(),
    ).resolves.toBe(true);
    expect(storage.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY)).toBe(
      "keep-this-journey",
    );
    expect(storage.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY)).toBe(
      WEB_PRIVATE_NEVER_OWNED_VALUE,
    );

    authBoundary.legacyGuestAuthorization = "explicit-clear";
    await expect(
      adoptAmbiguousLegacyWebPrivateDataAsGuest(),
    ).resolves.toBe(false);
  });

  it("clears both namespaces and databases before publishing empty provenance", async () => {
    const storage = installBrowser();
    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "legacy-private");
    storage.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "v2-private");
    storage.setItem(
      WEB_PRIVATE_NAMESPACE_V2_MARKER,
      WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
    );
    await putAvatar(
      LEGACY_AVATAR_DATABASE_NAME,
      "legacy-avatar",
      new Blob([new Uint8Array([1])]),
    );
    await putAvatar(
      WEB_V2_AVATAR_DATABASE_NAME,
      "v2-avatar",
      new Blob([new Uint8Array([2])]),
    );
    authBoundary.legacyGuestAuthorization = "explicit-clear";

    await expect(
      purgeAmbiguousWebPrivateDataAndEstablishGuest(),
    ).resolves.toBe(true);
    expect(readWebPrivateNamespaceState(storage)).toBe("legacy");
    expect(storage.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY)).toBe(
      WEB_PRIVATE_NEVER_OWNED_VALUE,
    );
    expect(
      (await indexedDB.databases()).filter((database) =>
        [LEGACY_AVATAR_DATABASE_NAME, WEB_V2_AVATAR_DATABASE_NAME].includes(
          database.name ?? "",
        ),
      ),
    ).toEqual([]);
  });

  it("resumes explicit clear after every localStorage crash boundary", async () => {
    const completed = installBrowser();
    completed.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "legacy-private");
    completed.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "v2-private");
    authBoundary.legacyGuestAuthorization = "explicit-clear";
    completed.resetMutationLog();
    await expect(
      purgeAmbiguousWebPrivateDataAndEstablishGuest(),
    ).resolves.toBe(true);
    const mutationCount = completed.mutationCount;

    for (let mutation = 1; mutation <= mutationCount; mutation += 1) {
      const storage = installBrowser();
      storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "legacy-private");
      storage.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "v2-private");
      storage.resetMutationLog();
      storage.throwAfterMutation = mutation;

      await expect(
        purgeAmbiguousWebPrivateDataAndEstablishGuest(),
      ).resolves.toBe(false);
      storage.throwAfterMutation = null;
      if (readWebPrivateGuestClearState(storage) === "clearing") {
        expect(readWebPrivateNamespaceState(storage)).toBe("unavailable");
        authBoundary.legacyGuestAuthorization = "inspect";
        await expect(classifyLegacyWebPrivateGuestRecovery()).resolves.toBe(
          "unavailable",
        );
        authBoundary.legacyGuestAuthorization = "explicit-keep";
        await expect(
          adoptAmbiguousLegacyWebPrivateDataAsGuest(),
        ).resolves.toBe(false);
      }

      authBoundary.legacyGuestAuthorization = "explicit-clear";
      await expect(
        purgeAmbiguousWebPrivateDataAndEstablishGuest(),
      ).resolves.toBe(true);
      expect(readWebPrivateGuestClearState(storage)).toBe("none");
      expect(readWebPrivateNamespaceState(storage)).toBe("legacy");
      expect(storage.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY)).toBe(
        WEB_PRIVATE_NEVER_OWNED_VALUE,
      );
    }
  });

  it("retains explicit-clear intent across a blocked database deletion", async () => {
    const storage = installBrowser();
    storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "legacy-private");
    const database = await openAvatarDatabase(LEGACY_AVATAR_DATABASE_NAME);
    database.onversionchange = () => undefined;
    authBoundary.legacyGuestAuthorization = "explicit-clear";

    await expect(
      purgeAmbiguousWebPrivateDataAndEstablishGuest(),
    ).resolves.toBe(false);
    expect(readWebPrivateGuestClearState(storage)).toBe("clearing");
    expect(readWebPrivateNamespaceState(storage)).toBe("unavailable");

    database.close();
    await expect(
      purgeAmbiguousWebPrivateDataAndEstablishGuest(),
    ).resolves.toBe(true);
    expect(readWebPrivateGuestClearState(storage)).toBe("none");
    expect(storage.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY)).toBe(
      WEB_PRIVATE_NEVER_OWNED_VALUE,
    );
  });
});

describe("never-owned guest provenance", () => {
  it("writes provenance last only after every private namespace is empty", async () => {
    const storage = installBrowser();
    storage.resetMutationLog();

    await expect(
      establishNeverOwnedWebPrivateGuestProvenance(),
    ).resolves.toBe(true);
    expect(storage.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY)).toBe(
      WEB_PRIVATE_NEVER_OWNED_VALUE,
    );
    expect(storage.mutations.at(-1)).toEqual({
      key: LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
      type: "set",
    });
  });

  it("never blesses ambiguous localStorage, avatar bytes, or unavailable IDB", async () => {
    const localBytes = installBrowser();
    localBytes.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "ambiguous");
    await expect(
      establishNeverOwnedWebPrivateGuestProvenance(),
    ).resolves.toBe(false);
    expect(localBytes.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY)).toBeNull();

    const avatarBytes = installBrowser();
    await putAvatar(
      LEGACY_AVATAR_DATABASE_NAME,
      "ambiguous-avatar",
      new Blob([new Uint8Array([1])]),
    );
    await expect(
      establishNeverOwnedWebPrivateGuestProvenance(),
    ).resolves.toBe(false);
    expect(avatarBytes.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY)).toBeNull();

    const noDatabase = installBrowser();
    vi.stubGlobal("indexedDB", undefined);
    await expect(
      establishNeverOwnedWebPrivateGuestProvenance(),
    ).resolves.toBe(false);
    expect(noDatabase.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY)).toBeNull();
  });
});

describe("terminal empty-namespace proof", () => {
  it("accepts only bounded empty localStorage and avatar databases", async () => {
    const storage = installBrowser();
    const emptyDatabase = await openAvatarDatabase(
      LEGACY_AVATAR_DATABASE_NAME,
    );
    emptyDatabase.close();

    await expect(proveAllWebPrivateDataNamespacesEmpty()).resolves.toBe(true);
    expect(
      (await indexedDB.databases()).some(
        (database) => database.name === LEGACY_AVATAR_DATABASE_NAME,
      ),
    ).toBe(true);

    storage.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, "private");
    await expect(proveAllWebPrivateDataNamespacesEmpty()).resolves.toBe(false);
    expect(storage.getItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY)).toBe("private");
  });

  it("rejects avatar residue or lost terminal authority without mutation", async () => {
    installBrowser();
    await putAvatar(
      WEB_V2_AVATAR_DATABASE_NAME,
      "private-avatar",
      new Blob([new Uint8Array([1])]),
    );
    await expect(proveAllWebPrivateDataNamespacesEmpty()).resolves.toBe(false);
    expect(
      await getAvatar(WEB_V2_AVATAR_DATABASE_NAME, "private-avatar"),
    ).toBeInstanceOf(Blob);

    authBoundary.terminalRemoval = false;
    await expect(proveAllWebPrivateDataNamespacesEmpty()).resolves.toBe(false);
  });
});
