import type {
  ConnectionsProgress,
  GameProgress,
  GamePuzzle,
  TimelineProgress,
} from "./types";
import {
  captureDevicePrivateStorageReadLease as captureWebPrivateStorageReadLease,
  removeDevicePrivateStorageItem as removeWebPrivateStorageItem,
  devicePrivateStorageReadAllowed as webPrivateStorageReadAllowed,
  devicePrivateStorageReadLeaseIsCurrent as webPrivateStorageReadLeaseIsCurrent,
  withDevicePrivateWriteGuard as withWebPrivateWriteGuard,
} from "@/lib/storage/device-private-write";
import {
  DEVICE_GAME_STORAGE_KEY as LEGACY_GAME_STORAGE_KEY,
  PROTECTED_GAME_STORAGE_KEY as WEB_V2_GAME_STORAGE_KEY,
  selectDevicePrivateStorageKey as selectedWebPrivateStorageKey,
} from "@/lib/storage/device-private-storage";
import {
  registerDevicePrivateMemoryReset as registerWebPrivateMemoryReset,
  type DevicePrivateReadLease as WebPrivateReadLease,
} from "@/lib/storage/device-private-write";

export const GAME_STORAGE_KEY = LEGACY_GAME_STORAGE_KEY;
export const GAME_STORAGE_VERSION = 2;
export const MAX_STORED_GAME_SESSIONS = 14;
const MAX_GAME_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_GAME_READ_LEASES = 32;
const gameReadLeases = new Map<string, WebPrivateReadLease | null>();

/** Retains only bounded opaque read leases for currently rendered sessions. */
function rememberGameReadLease(
  sessionKey: string,
  lease: WebPrivateReadLease | null,
): void {
  gameReadLeases.delete(sessionKey);
  gameReadLeases.set(sessionKey, lease);
  while (gameReadLeases.size > MAX_GAME_READ_LEASES) {
    const oldest = gameReadLeases.keys().next().value;
    if (typeof oldest !== "string") break;
    gameReadLeases.delete(oldest);
  }
}

interface GameStorageEnvelope {
  version: typeof GAME_STORAGE_VERSION;
  entries: GameProgress[];
}

function isStringArray(value: unknown, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxLength &&
    value.every((item) => typeof item === "string" && item.length <= 100)
  );
}

function isBaseProgress(value: unknown): value is GameProgress {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<GameProgress>;
  return (
    typeof entry.sessionKey === "string" &&
    entry.sessionKey.length > 0 &&
    entry.sessionKey.length <= 160 &&
    typeof entry.puzzleId === "string" &&
    entry.puzzleId.length > 0 &&
    entry.puzzleId.length <= 100 &&
    Number.isInteger(entry.contentVersion) &&
    Number(entry.contentVersion) > 0 &&
    (entry.status === "playing" ||
      entry.status === "completed" ||
      entry.status === "revealed") &&
    Number.isInteger(entry.misses) &&
    Number(entry.misses) >= 0 &&
    typeof entry.learningEventRecorded === "boolean" &&
    Number.isFinite(entry.updatedAt) &&
    Number(entry.updatedAt) >= 0 &&
    Number(entry.updatedAt) <= Date.now() + MAX_GAME_CLOCK_SKEW_MS &&
    entry.learningEventRecorded === (entry.status !== "playing") &&
    (entry.kind === "connections" || entry.kind === "timeline")
  );
}

function sanitizeProgress(
  value: unknown,
  puzzle?: GamePuzzle,
): GameProgress | null {
  if (!isBaseProgress(value)) return null;
  if (
    puzzle &&
    (value.puzzleId !== puzzle.id ||
      value.kind !== puzzle.kind ||
      value.contentVersion !== puzzle.contentVersion)
  ) {
    return null;
  }
  if (value.kind === "connections") {
    const entry = value as Partial<ConnectionsProgress>;
    if (
      !isStringArray(entry.termOrder, 12) ||
      entry.termOrder.length !== 12 ||
      new Set(entry.termOrder).size !== 12 ||
      !isStringArray(entry.selectedTerms, 4) ||
      new Set(entry.selectedTerms).size !== entry.selectedTerms.length ||
      !isStringArray(entry.solvedGroupIds, 3) ||
      new Set(entry.solvedGroupIds).size !== entry.solvedGroupIds.length ||
      value.misses > 4 ||
      (value.status !== "playing" && entry.selectedTerms.length > 0) ||
      (value.status === "playing" &&
        (value.misses >= 4 || entry.solvedGroupIds.length >= 3)) ||
      (value.status === "completed" &&
        (entry.solvedGroupIds.length !== 3 || value.misses >= 4)) ||
      (value.status === "revealed" && entry.solvedGroupIds.length >= 3)
    ) {
      return null;
    }
    const selectedTerms = entry.selectedTerms;
    const solvedGroupIds = entry.solvedGroupIds;
    if (puzzle?.kind === "connections") {
      const terms = new Set(puzzle.groups.flatMap((group) => group.terms));
      const groups = new Set(puzzle.groups.map((group) => group.id));
      if (
        entry.termOrder.some((term) => !terms.has(term)) ||
        selectedTerms.some((term) => !terms.has(term)) ||
        solvedGroupIds.some((id) => !groups.has(id)) ||
        selectedTerms.some((term) =>
          puzzle.groups.some(
            (group) =>
              solvedGroupIds.includes(group.id) &&
              group.terms.includes(term),
          ),
        )
      ) {
        return null;
      }
    }
    return entry as ConnectionsProgress;
  }
  const entry = value as Partial<TimelineProgress>;
  if (
    !isStringArray(entry.itemOrder, 4) ||
    entry.itemOrder.length !== 4 ||
    new Set(entry.itemOrder).size !== 4 ||
    !isStringArray(entry.selectedItemIds, 4) ||
    new Set(entry.selectedItemIds).size !== entry.selectedItemIds.length ||
    value.misses > 3 ||
    (value.status === "playing" && value.misses >= 3) ||
    (value.status === "playing" && entry.selectedItemIds.length >= 4) ||
    (value.status === "completed" &&
      (value.misses >= 3 || entry.selectedItemIds.length !== 4)) ||
    (value.status === "revealed" && entry.selectedItemIds.length !== 4)
  ) {
    return null;
  }
  if (puzzle?.kind === "timeline") {
    const correctOrder = puzzle.items.map((item) => item.id);
    const selectedAreCorrect = entry.selectedItemIds.every(
      (id, index) => id === correctOrder[index],
    );
    if (
      entry.itemOrder.some(
        (id) => !puzzle.items.some((item) => item.id === id),
      ) ||
      !selectedAreCorrect
    ) {
      return null;
    }
  }
  return entry as TimelineProgress;
}

function readEnvelope(
  storage: Storage,
  testFixtureStorage = false,
  purgeInvalid = true,
): GameStorageEnvelope {
  let raw: string | null = null;
  try {
    if (!webPrivateStorageReadAllowed(storage, testFixtureStorage)) {
      return { version: GAME_STORAGE_VERSION, entries: [] };
    }
    const key = gameStorageKey(storage);
    if (!key) return { version: GAME_STORAGE_VERSION, entries: [] };
    raw = storage.getItem(key);
    if (
      !webPrivateStorageReadAllowed(storage, testFixtureStorage) ||
      !raw
    ) {
      return { version: GAME_STORAGE_VERSION, entries: [] };
    }
    const parsed = JSON.parse(raw) as Partial<GameStorageEnvelope>;
    if (
      parsed.version !== GAME_STORAGE_VERSION ||
      !Array.isArray(parsed.entries)
    ) {
      if (purgeInvalid) {
        void removeWebPrivateStorageItem(
          storage,
          key,
          testFixtureStorage,
          raw,
        );
      }
      return { version: GAME_STORAGE_VERSION, entries: [] };
    }
    const entries = parsed.entries
      .map((entry) => sanitizeProgress(entry))
      .filter((entry): entry is GameProgress => Boolean(entry))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORED_GAME_SESSIONS);
    return webPrivateStorageReadAllowed(storage, testFixtureStorage)
      ? { version: GAME_STORAGE_VERSION, entries }
      : { version: GAME_STORAGE_VERSION, entries: [] };
  } catch {
    const key = gameStorageKey(storage);
    if (
      purgeInvalid &&
      key &&
      raw !== null &&
      webPrivateStorageReadAllowed(storage, testFixtureStorage)
    ) {
      void removeWebPrivateStorageItem(
        storage,
        key,
        testFixtureStorage,
        raw,
      );
    }
    return { version: GAME_STORAGE_VERSION, entries: [] };
  }
}

/** Resolves the atomically selected guest or installed-account namespace. */
function gameStorageKey(storage: Storage): string | null {
  return selectedWebPrivateStorageKey(
    storage,
    LEGACY_GAME_STORAGE_KEY,
    WEB_V2_GAME_STORAGE_KEY,
  );
}

/** Resolves browser storage without crashing in restricted privacy contexts. */
function browserGameStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Restores only the exact reviewed content version for this local session. */
export function readGameProgress(
  puzzle: GamePuzzle,
  sessionKey: string,
  storage?: Storage,
): GameProgress | null {
  const target = storage ?? browserGameStorage();
  if (!target) return null;
  const testFixtureStorage = storage !== undefined;
  const lease = captureWebPrivateStorageReadLease(
    target,
    testFixtureStorage,
  );
  if (
    !webPrivateStorageReadLeaseIsCurrent(
      lease,
      target,
      testFixtureStorage,
    )
  ) {
    return null;
  }
  const envelope = readEnvelope(target, storage !== undefined);
  if (
    !webPrivateStorageReadLeaseIsCurrent(
      lease,
      target,
      testFixtureStorage,
    )
  ) {
    return null;
  }
  rememberGameReadLease(sessionKey, lease);
  const candidate = envelope.entries.find(
    (entry) => entry.sessionKey === sessionKey,
  );
  const progress = sanitizeProgress(candidate, puzzle);
  if (candidate && !progress) {
    void removeInvalidGameProgress(
      target,
      puzzle,
      sessionKey,
      testFixtureStorage,
      lease,
    );
  }
  return progress;
}

/** Re-reads before removing one still-invalid session under the shared lock. */
async function removeInvalidGameProgress(
  storage: Storage,
  puzzle: GamePuzzle,
  sessionKey: string,
  testFixtureStorage = false,
  expectedReadLease: WebPrivateReadLease | null = null,
): Promise<void> {
  await withWebPrivateWriteGuard(() => {
    const key = gameStorageKey(storage);
    if (!key) return { value: undefined };
    const previous = storage.getItem(key);
    const envelope = readEnvelope(storage, testFixtureStorage, false);
    const candidate = envelope.entries.find(
      (entry) => entry.sessionKey === sessionKey,
    );
    if (!candidate || sanitizeProgress(candidate, puzzle)) {
      return { value: undefined };
    }
    const encoded = JSON.stringify({
      version: GAME_STORAGE_VERSION,
      entries: envelope.entries.filter(
        (entry) => entry.sessionKey !== sessionKey,
      ),
    });
    storage.setItem(key, encoded);
    if (storage.getItem(key) !== encoded) {
      throw new Error("game progress cleanup failed");
    }
    return {
      value: undefined,
      rollback: () => {
        if (storage.getItem(key) === encoded && previous !== null) {
          storage.setItem(key, previous);
        }
      },
    };
  }, testFixtureStorage, {
    expectedReadLease,
    readStorage: storage,
  });
}

/** Persists bounded game mechanics locally; no answer or result telemetry exists. */
export function writeGameProgress(
  progress: GameProgress,
  puzzle: GamePuzzle,
  storage?: Storage,
): Promise<boolean> {
  const safe = sanitizeProgress(progress, puzzle);
  const target = storage ?? browserGameStorage();
  if (!safe || !target) return Promise.resolve(false);
  const testFixtureStorage = storage !== undefined;
  const hasLease = gameReadLeases.has(safe.sessionKey);
  const lease = hasLease ? gameReadLeases.get(safe.sessionKey) ?? null : null;
  if (
    !hasLease &&
    !webPrivateStorageReadLeaseIsCurrent(
      lease,
      target,
      testFixtureStorage,
    )
  ) {
    return Promise.resolve(false);
  }
  return withWebPrivateWriteGuard(() => {
    const key = gameStorageKey(target);
    if (!key) return { value: false };
    const previous = target.getItem(key);
    const envelope = readEnvelope(target, testFixtureStorage, false);
    const entries = [
      safe,
      ...envelope.entries.filter(
        (entry) => entry.sessionKey !== safe.sessionKey,
      ),
    ]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_STORED_GAME_SESSIONS);
    const encoded = JSON.stringify({
      version: GAME_STORAGE_VERSION,
      entries,
    });
    target.setItem(key, encoded);
    if (target.getItem(key) !== encoded) {
      throw new Error("game progress storage failed");
    }
    return {
      value: true,
      rollback: () => {
        if (target.getItem(key) !== encoded) return;
        if (previous === null) target.removeItem(key);
        else target.setItem(key, previous);
      },
    };
  }, testFixtureStorage, {
    expectedReadLease: lease,
    readStorage: target,
  }).then(
    (result) => result.committed && result.value,
  );
}

// Auth rotation discards every lease held by stale rendered game components.
registerWebPrivateMemoryReset(() => gameReadLeases.clear());

/** Clears every device-local game session for Settings clear/delete flows. */
export function clearGameProgress(storage?: Storage): Promise<boolean> {
  const target = storage ?? browserGameStorage();
  if (!target) return Promise.resolve(false);
  const key = gameStorageKey(target);
  if (!key) return Promise.resolve(false);
  return removeWebPrivateStorageItem(target, key, storage !== undefined);
}

/** Removes both web namespaces after terminal account deletion. */
export async function purgeGameProgress(storage?: Storage): Promise<boolean> {
  const target = storage ?? browserGameStorage();
  if (!target) return false;
  const results = await Promise.all([
    removeWebPrivateStorageItem(
      target,
      LEGACY_GAME_STORAGE_KEY,
      storage !== undefined,
    ),
    removeWebPrivateStorageItem(
      target,
      WEB_V2_GAME_STORAGE_KEY,
      storage !== undefined,
    ),
  ]);
  return results.every(Boolean);
}
