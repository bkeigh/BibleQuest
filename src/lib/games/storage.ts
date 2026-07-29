import type {
  ConnectionsProgress,
  GameProgress,
  GamePuzzle,
  TimelineProgress,
} from "./types";

export const GAME_STORAGE_KEY = "biblequest:scripture-games:v1";
export const GAME_STORAGE_VERSION = 1;
export const MAX_STORED_GAME_SESSIONS = 14;
const MAX_GAME_CLOCK_SKEW_MS = 5 * 60 * 1000;

interface GameStorageEnvelope {
  version: typeof GAME_STORAGE_VERSION;
  entries: GameProgress[];
}

/** Best-effort cleanup never turns unavailable storage into a page crash. */
function removeGameEnvelope(storage: Storage): void {
  try {
    storage.removeItem(GAME_STORAGE_KEY);
  } catch {
    // Restricted storage is equivalent to no local resume capability.
  }
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
    entry.puzzleId.length <= 100 &&
    Number.isInteger(entry.contentVersion) &&
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
    value.misses > 3 ||
    (value.status === "playing" && value.misses >= 3) ||
    (value.status === "completed" && value.misses >= 3)
  ) {
    return null;
  }
  if (puzzle?.kind === "timeline") {
    const correctOrder = puzzle.items.map((item) => item.id);
    const isCorrect = entry.itemOrder.every(
      (id, index) => id === correctOrder[index],
    );
    if (
      entry.itemOrder.some(
        (id) => !puzzle.items.some((item) => item.id === id),
      ) ||
      ((value.status === "completed" || value.status === "revealed") &&
        !isCorrect)
    ) {
      return null;
    }
  }
  return entry as TimelineProgress;
}

function readEnvelope(storage: Storage): GameStorageEnvelope {
  try {
    const raw = storage.getItem(GAME_STORAGE_KEY);
    if (!raw) return { version: GAME_STORAGE_VERSION, entries: [] };
    const parsed = JSON.parse(raw) as Partial<GameStorageEnvelope>;
    if (
      parsed.version !== GAME_STORAGE_VERSION ||
      !Array.isArray(parsed.entries)
    ) {
      removeGameEnvelope(storage);
      return { version: GAME_STORAGE_VERSION, entries: [] };
    }
    const entries = parsed.entries
      .map((entry) => sanitizeProgress(entry))
      .filter((entry): entry is GameProgress => Boolean(entry))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORED_GAME_SESSIONS);
    return { version: GAME_STORAGE_VERSION, entries };
  } catch {
    removeGameEnvelope(storage);
    return { version: GAME_STORAGE_VERSION, entries: [] };
  }
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
  const envelope = readEnvelope(target);
  const candidate = envelope.entries.find(
    (entry) => entry.sessionKey === sessionKey,
  );
  const progress = sanitizeProgress(candidate, puzzle);
  if (candidate && !progress) {
    writeEntries(
      envelope.entries.filter((entry) => entry.sessionKey !== sessionKey),
      target,
    );
  }
  return progress;
}

function writeEntries(entries: GameProgress[], storage: Storage): boolean {
  try {
    const bounded = [...entries]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORED_GAME_SESSIONS);
    storage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ version: GAME_STORAGE_VERSION, entries: bounded }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Persists bounded game mechanics locally; no answer or result telemetry exists. */
export function writeGameProgress(
  progress: GameProgress,
  puzzle: GamePuzzle,
  storage?: Storage,
): boolean {
  const safe = sanitizeProgress(progress, puzzle);
  const target = storage ?? browserGameStorage();
  if (!safe || !target) return false;
  const envelope = readEnvelope(target);
  return writeEntries(
    [
      safe,
      ...envelope.entries.filter(
        (entry) => entry.sessionKey !== safe.sessionKey,
      ),
    ],
    target,
  );
}

/** Clears every device-local game session for Settings clear/delete flows. */
export function clearGameProgress(storage?: Storage): boolean {
  const target = storage ?? browserGameStorage();
  if (!target) return false;
  try {
    target.removeItem(GAME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
