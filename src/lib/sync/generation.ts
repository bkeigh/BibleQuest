"use client";

const STORAGE_KEY = "biblequest:account-sync-generation:v1";
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

/** Parse only the small bounded generation ledger used for stale-device checks. */
function readLedger(storage: GenerationStorage): StoredGeneration[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
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

/** Return the last server generation observed for this exact account. */
export function getAccountSyncGeneration(
  userId: string,
  storage: GenerationStorage | null = browserStorage(),
): number | null {
  if (!UUID.test(userId) || !storage) return null;
  return readLedger(storage).find((entry) => entry.userId === userId)?.generation ?? null;
}

/** Report whether stale local account fields must be replaced before a push. */
export function accountSyncResetRequired(
  userId: string,
  storage: GenerationStorage | null = browserStorage(),
): boolean {
  if (!UUID.test(userId) || !storage) return false;
  return readLedger(storage).find((entry) => entry.userId === userId)?.resetRequired === true;
}

/** Persist a monotonic account generation outside exported journey data. */
export function setAccountSyncGeneration(
  userId: string,
  generation: number,
  storage: GenerationStorage | null = browserStorage(),
) {
  if (
    !UUID.test(userId) ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    !storage
  ) {
    throw new Error("Invalid account sync generation.");
  }
  const ledger = readLedger(storage);
  const previous = ledger.find((entry) => entry.userId === userId)?.generation;
  if (previous !== undefined && generation < previous) {
    throw new Error("Account sync generation cannot move backward.");
  }
  const resetRequired = ledger.find((entry) => entry.userId === userId)?.resetRequired;
  const accounts = ledger.filter((entry) => entry.userId !== userId);
  accounts.unshift({ userId, generation, ...(resetRequired ? { resetRequired: true } : {}) });
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, accounts: accounts.slice(0, MAX_ACCOUNTS) }),
  );
}

/** Persist a generation while requiring a server-authoritative local reset. */
export function markAccountSyncResetRequired(
  userId: string,
  generation: number,
  storage: GenerationStorage | null = browserStorage(),
) {
  setAccountSyncGeneration(userId, generation, storage);
  if (!storage) return;
  const ledger = readLedger(storage);
  const accounts = ledger.filter((entry) => entry.userId !== userId);
  accounts.unshift({ userId, generation, resetRequired: true });
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, accounts: accounts.slice(0, MAX_ACCOUNTS) }),
  );
}

/** Clear the reset latch only after the remote baseline has replaced local data. */
export function clearAccountSyncResetRequired(
  userId: string,
  storage: GenerationStorage | null = browserStorage(),
) {
  if (!UUID.test(userId) || !storage) return;
  const ledger = readLedger(storage);
  const current = ledger.find((entry) => entry.userId === userId);
  if (!current?.resetRequired) return;
  const accounts = ledger.filter((entry) => entry.userId !== userId);
  accounts.unshift({ userId, generation: current.generation });
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, accounts: accounts.slice(0, MAX_ACCOUNTS) }),
  );
}

/** Remove every retained generation after this device journey is deleted. */
export function clearStoredAccountSyncGenerations(
  storage: GenerationStorage | null = browserStorage(),
) {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing may make local storage unavailable.
  }
}

/** Remove one deleted account while retaining every other valid ledger entry. */
export function removeStoredAccountSyncGeneration(
  userId: string,
  storage: GenerationStorage | null = browserStorage(),
): boolean {
  if (!UUID.test(userId) || !storage) return false;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const accounts = parseCompleteLedger(raw);
    if (!accounts) return false;
    const remaining = accounts.filter((entry) => entry.userId !== userId);
    if (remaining.length === accounts.length) return true;
    if (remaining.length === 0) {
      storage.removeItem(STORAGE_KEY);
      return storage.getItem(STORAGE_KEY) === null;
    }
    const encoded = JSON.stringify({ version: 1, accounts: remaining });
    storage.setItem(STORAGE_KEY, encoded);
    return storage.getItem(STORAGE_KEY) === encoded;
  } catch {
    // An unreadable ledger cannot be rewritten without risking another account.
    return false;
  }
}

/** Validate the complete ledger before an account-scoped destructive rewrite. */
function parseCompleteLedger(raw: string): StoredGeneration[] | null {
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
}

/** Resolve localStorage only inside a browser boundary. */
function browserStorage(): GenerationStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
