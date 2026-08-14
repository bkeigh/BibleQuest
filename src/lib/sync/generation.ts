"use client";

import { isNativeTarget } from "@/lib/platform/target";
import {
  LEGACY_ACCOUNT_SYNC_GENERATION_STORAGE_KEY,
  WEB_V2_ACCOUNT_SYNC_GENERATION_STORAGE_KEY,
  selectedWebPrivateStorageKey,
} from "@/lib/storage/web-private-namespace";
import {
  withWebPrivateRemovalGuard,
  withWebPrivateWriteGuard,
} from "@/lib/storage/web-private-write";
import { webPrivateReadAllowed } from "@/lib/supabase/web-auth-storage";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ACCOUNTS = 4;

interface StoredGeneration {
  userId: string;
  generation: number;
  resetRequired?: boolean;
}

interface StoredGenerations {
  version: 1;
  accounts: StoredGeneration[];
}

interface GenerationStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

/** Allows deterministic storage fixtures only in DOM-less test processes. */
function isTestFixtureStorage(explicitStorage: boolean): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    (explicitStorage || typeof document === "undefined")
  );
}

/** Selects one namespace only after exact private-read authority is active. */
function generationStorageKey(
  storage: GenerationStorage,
  testFixtureStorage: boolean,
): string | null {
  if (
    !testFixtureStorage &&
    !isNativeTarget() &&
    !webPrivateReadAllowed(storage)
  ) {
    return null;
  }
  return selectedWebPrivateStorageKey(
    storage,
    LEGACY_ACCOUNT_SYNC_GENERATION_STORAGE_KEY,
    WEB_V2_ACCOUNT_SYNC_GENERATION_STORAGE_KEY,
  );
}

/** Parses only the small bounded generation ledger used for stale-device checks. */
function readLedger(
  storage: GenerationStorage,
  key: string,
): StoredGeneration[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredGenerations>;
    if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) return [];
    return parsed.accounts
      .filter(
        (entry): entry is StoredGeneration =>
          Boolean(entry) &&
          UUID.test(entry.userId) &&
          Number.isSafeInteger(entry.generation) &&
          entry.generation >= 0 &&
          (entry.resetRequired === undefined ||
            typeof entry.resetRequired === "boolean"),
      )
      .slice(0, MAX_ACCOUNTS);
  } catch {
    return [];
  }
}

/** Rejects any partial or malformed ledger before a destructive rewrite. */
function readLedgerForMutation(
  storage: GenerationStorage,
  key: string,
): StoredGeneration[] | null {
  const raw = storage.getItem(key);
  return raw === null ? [] : parseCompleteLedger(raw);
}

/** Returns the last server generation observed for this exact account. */
export function getAccountSyncGeneration(
  userId: string,
  storage: GenerationStorage | null = browserStorage(),
): number | null {
  if (!UUID.test(userId) || !storage) return null;
  const key = generationStorageKey(
    storage,
    isTestFixtureStorage(arguments.length >= 2),
  );
  if (!key) return null;
  return readLedger(storage, key).find((entry) => entry.userId === userId)
    ?.generation ?? null;
}

/** Reports whether stale local account fields must be replaced before a push. */
export function accountSyncResetRequired(
  userId: string,
  storage: GenerationStorage | null = browserStorage(),
): boolean {
  if (!UUID.test(userId) || !storage) return false;
  const key = generationStorageKey(
    storage,
    isTestFixtureStorage(arguments.length >= 2),
  );
  if (!key) return true;
  return readLedger(storage, key).find((entry) => entry.userId === userId)
    ?.resetRequired === true;
}

/** Persists one complete bounded ledger with exact readback under its guard. */
function writeLedger(
  storage: GenerationStorage,
  key: string,
  accounts: StoredGeneration[],
): { value: boolean; rollback: () => void } {
  const previous = storage.getItem(key);
  const encoded = JSON.stringify({
    version: 1,
    accounts: accounts.slice(0, MAX_ACCOUNTS),
  } satisfies StoredGenerations);
  storage.setItem(key, encoded);
  if (storage.getItem(key) !== encoded) {
    throw new Error("account generation persistence failed");
  }
  return {
    value: true,
    rollback: () => {
      if (storage.getItem(key) !== encoded) return;
      if (previous === null) storage.removeItem(key);
      else storage.setItem(key, previous);
    },
  };
}

/** Persists a monotonic account generation outside exported journey data. */
export async function setAccountSyncGeneration(
  userId: string,
  generation: number,
  storage: GenerationStorage | null = browserStorage(),
): Promise<boolean> {
  if (
    !UUID.test(userId) ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    !storage
  ) {
    throw new Error("Invalid account sync generation.");
  }
  const testFixture = isTestFixtureStorage(arguments.length >= 3);
  const result = await withWebPrivateWriteGuard(() => {
    const key = generationStorageKey(storage, testFixture);
    if (!key) return { value: false };
    const ledger = readLedgerForMutation(storage, key);
    if (!ledger) return { value: false };
    const current = ledger.find((entry) => entry.userId === userId);
    if (current && generation < current.generation) {
      return { value: false };
    }
    const accounts = ledger.filter((entry) => entry.userId !== userId);
    accounts.unshift({
      userId,
      generation,
      ...(current?.resetRequired ? { resetRequired: true } : {}),
    });
    return writeLedger(storage, key, accounts);
  }, testFixture);
  return result.committed && result.value;
}

/** Persists a generation while requiring a server-authoritative local reset. */
export async function markAccountSyncResetRequired(
  userId: string,
  generation: number,
  storage: GenerationStorage | null = browserStorage(),
): Promise<boolean> {
  if (
    !UUID.test(userId) ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    !storage
  ) {
    throw new Error("Invalid account sync generation.");
  }
  const testFixture = isTestFixtureStorage(arguments.length >= 3);
  const result = await withWebPrivateWriteGuard(() => {
    const key = generationStorageKey(storage, testFixture);
    if (!key) return { value: false };
    const ledger = readLedgerForMutation(storage, key);
    if (!ledger) return { value: false };
    const current = ledger.find((entry) => entry.userId === userId);
    if (current && generation < current.generation) {
      return { value: false };
    }
    const accounts = ledger.filter((entry) => entry.userId !== userId);
    accounts.unshift({ userId, generation, resetRequired: true });
    return writeLedger(storage, key, accounts);
  }, testFixture);
  return result.committed && result.value;
}

/** Clears the reset latch only after the remote baseline replaced local data. */
export async function clearAccountSyncResetRequired(
  userId: string,
  storage: GenerationStorage | null = browserStorage(),
): Promise<boolean> {
  if (!UUID.test(userId) || !storage) return false;
  const testFixture = isTestFixtureStorage(arguments.length >= 2);
  const result = await withWebPrivateWriteGuard(() => {
    const key = generationStorageKey(storage, testFixture);
    if (!key) return { value: false };
    const ledger = readLedgerForMutation(storage, key);
    if (!ledger) return { value: false };
    const current = ledger.find((entry) => entry.userId === userId);
    if (!current?.resetRequired) return { value: true };
    const accounts = ledger.filter((entry) => entry.userId !== userId);
    accounts.unshift({ userId, generation: current.generation });
    return writeLedger(storage, key, accounts);
  }, testFixture);
  return result.committed && result.value;
}

/** Removes both namespace ledgers only in an ordinary or reviewed reset. */
export async function clearStoredAccountSyncGenerations(
  storage: GenerationStorage | null = browserStorage(),
): Promise<boolean> {
  if (!storage) return false;
  const testFixture = isTestFixtureStorage(arguments.length >= 1);
  const keys = [
    LEGACY_ACCOUNT_SYNC_GENERATION_STORAGE_KEY,
    WEB_V2_ACCOUNT_SYNC_GENERATION_STORAGE_KEY,
  ];
  const result = await withWebPrivateRemovalGuard(() => {
    const previous = new Map(keys.map((key) => [key, storage.getItem(key)]));
    for (const key of keys) storage.removeItem(key);
    if (keys.some((key) => storage.getItem(key) !== null)) {
      throw new Error("account generation cleanup failed");
    }
    return {
      value: true,
      rollback: () => {
        for (const key of keys) {
          const value = previous.get(key);
          if (value !== null && value !== undefined) storage.setItem(key, value);
        }
      },
    };
  }, testFixture);
  return result.committed && result.value;
}

/** Removes one deleted account while retaining other valid ledger entries. */
export async function removeStoredAccountSyncGeneration(
  userId: string,
  storage: GenerationStorage | null = browserStorage(),
): Promise<boolean> {
  if (!UUID.test(userId) || !storage) return false;
  const testFixture = isTestFixtureStorage(arguments.length >= 2);
  const result = await withWebPrivateRemovalGuard(() => {
    const key = generationStorageKey(storage, testFixture);
    if (!key) return { value: false };
    const raw = storage.getItem(key);
    if (!raw) return { value: true };
    const accounts = parseCompleteLedger(raw);
    if (!accounts) return { value: false };
    const remaining = accounts.filter((entry) => entry.userId !== userId);
    if (remaining.length === accounts.length) return { value: true };
    if (remaining.length === 0) storage.removeItem(key);
    else {
      storage.setItem(
        key,
        JSON.stringify({ version: 1, accounts: remaining }),
      );
    }
    const next = storage.getItem(key);
    const expected = remaining.length === 0
      ? null
      : JSON.stringify({ version: 1, accounts: remaining });
    if (next !== expected) throw new Error("account generation cleanup failed");
    return {
      value: true,
      rollback: () => {
        if (storage.getItem(key) === expected) storage.setItem(key, raw);
      },
    };
  }, testFixture);
  return result.committed && result.value;
}

/** Validates the complete ledger before an account-scoped destructive rewrite. */
function parseCompleteLedger(raw: string): StoredGeneration[] | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredGenerations>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.accounts) ||
      parsed.accounts.length > MAX_ACCOUNTS
    ) {
      return null;
    }
    const accounts = parsed.accounts.filter(
      (entry): entry is StoredGeneration =>
        Boolean(entry) &&
        UUID.test(entry.userId) &&
        Number.isSafeInteger(entry.generation) &&
        entry.generation >= 0 &&
        (entry.resetRequired === undefined ||
          typeof entry.resetRequired === "boolean"),
    );
    if (
      accounts.length !== parsed.accounts.length ||
      new Set(accounts.map((entry) => entry.userId)).size !== accounts.length
    ) {
      return null;
    }
    return accounts;
  } catch {
    return null;
  }
}

/** Resolves localStorage only inside a browser boundary. */
function browserStorage(): GenerationStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
