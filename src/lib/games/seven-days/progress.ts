import { SEVEN_DAYS_CONTENT_VERSION } from "./content";
import { SEVEN_DAYS_LEVELS, SEVEN_DAYS_LEVEL_BY_ID, levelOrdinal } from "./levels";
import type { SevenDaysLevel } from "./types";

export const SEVEN_DAYS_STORAGE_KEY = "biblequest:seven-days-match:v1";
export const SEVEN_DAYS_STORAGE_VERSION = 1;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * What the game remembers, and nothing else: which levels have been cleared,
 * and which were answered on the first try. No score history, no attempt
 * counts, no identity — a match-3 board is not a record of anyone's faith.
 */
export interface SevenDaysProgress {
  readonly version: typeof SEVEN_DAYS_STORAGE_VERSION;
  readonly contentVersion: number;
  readonly cleared: readonly string[];
  readonly firstTry: readonly string[];
  readonly updatedAt: number;
}

export function emptySevenDaysProgress(now = Date.now()): SevenDaysProgress {
  return {
    version: SEVEN_DAYS_STORAGE_VERSION,
    contentVersion: SEVEN_DAYS_CONTENT_VERSION,
    cleared: [],
    firstTry: [],
    updatedAt: now,
  };
}

function knownLevelIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > SEVEN_DAYS_LEVELS.length) return null;
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    if (!SEVEN_DAYS_LEVEL_BY_ID.has(entry)) return null;
    if (ids.includes(entry)) continue;
    ids.push(entry);
  }
  return ids;
}

/**
 * Rejects anything that did not come from this build's content. A stored id
 * that no longer exists means the catalogue moved on, and a fresh start is
 * kinder than a map with holes in it.
 */
export function sanitizeSevenDaysProgress(
  value: unknown,
): SevenDaysProgress | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<SevenDaysProgress>;
  if (entry.version !== SEVEN_DAYS_STORAGE_VERSION) return null;
  if (entry.contentVersion !== SEVEN_DAYS_CONTENT_VERSION) return null;
  if (
    !Number.isFinite(entry.updatedAt) ||
    Number(entry.updatedAt) < 0 ||
    Number(entry.updatedAt) > Date.now() + MAX_CLOCK_SKEW_MS
  ) {
    return null;
  }
  const cleared = knownLevelIds(entry.cleared);
  const firstTry = knownLevelIds(entry.firstTry);
  if (!cleared || !firstTry) return null;
  // A level answered on the first try must also be a level that was cleared.
  if (firstTry.some((id) => !cleared.includes(id))) return null;
  return {
    version: SEVEN_DAYS_STORAGE_VERSION,
    contentVersion: SEVEN_DAYS_CONTENT_VERSION,
    cleared,
    firstTry,
    updatedAt: Number(entry.updatedAt),
  };
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSevenDaysProgress(storage?: Storage): SevenDaysProgress {
  const target = storage ?? browserStorage();
  if (!target) return emptySevenDaysProgress();
  try {
    const raw = target.getItem(SEVEN_DAYS_STORAGE_KEY);
    if (!raw) return emptySevenDaysProgress();
    const progress = sanitizeSevenDaysProgress(JSON.parse(raw));
    if (progress) return progress;
    target.removeItem(SEVEN_DAYS_STORAGE_KEY);
  } catch {
    // Restricted storage simply means this device does not keep a map.
  }
  return emptySevenDaysProgress();
}

export function writeSevenDaysProgress(
  progress: SevenDaysProgress,
  storage?: Storage,
): boolean {
  const safe = sanitizeSevenDaysProgress(progress);
  const target = storage ?? browserStorage();
  if (!safe || !target) return false;
  try {
    target.setItem(SEVEN_DAYS_STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

/**
 * Answers "will this device remember?" without writing a record for someone
 * who has not played yet. Private-mode browsers get an honest note instead of
 * a map that silently forgets.
 */
export function sevenDaysStorageAvailable(storage?: Storage): boolean {
  const target = storage ?? browserStorage();
  if (!target) return false;
  const probe = `${SEVEN_DAYS_STORAGE_KEY}:probe`;
  try {
    target.setItem(probe, "1");
    target.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function clearSevenDaysProgress(storage?: Storage): boolean {
  const target = storage ?? browserStorage();
  if (!target) return false;
  try {
    target.removeItem(SEVEN_DAYS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Records a cleared level without ever losing an earlier first-try mark. */
export function markLevelCleared(
  progress: SevenDaysProgress,
  level: SevenDaysLevel,
  answeredFirstTry: boolean,
  now = Date.now(),
): SevenDaysProgress {
  const cleared = progress.cleared.includes(level.id)
    ? progress.cleared
    : [...progress.cleared, level.id];
  const firstTry =
    answeredFirstTry && !progress.firstTry.includes(level.id)
      ? [...progress.firstTry, level.id]
      : progress.firstTry;
  return { ...progress, cleared, firstTry, updatedAt: now };
}

export function isLevelCleared(
  progress: SevenDaysProgress,
  level: SevenDaysLevel,
): boolean {
  return progress.cleared.includes(level.id);
}

/**
 * A level opens when the one before it has been cleared. Levels already
 * cleared stay open, so a reader can revisit a day whenever they like.
 */
export function isLevelUnlocked(
  progress: SevenDaysProgress,
  level: SevenDaysLevel,
): boolean {
  const ordinal = levelOrdinal(level);
  if (ordinal === 0) return true;
  const previous = SEVEN_DAYS_LEVELS[ordinal - 1];
  return progress.cleared.includes(previous.id);
}

/** The level a "Continue" button should open: the first one not yet cleared. */
export function nextLevel(progress: SevenDaysProgress): SevenDaysLevel {
  const pending = SEVEN_DAYS_LEVELS.find(
    (level) => !progress.cleared.includes(level.id),
  );
  return pending ?? SEVEN_DAYS_LEVELS[SEVEN_DAYS_LEVELS.length - 1];
}

export interface SevenDaysSummary {
  readonly cleared: number;
  readonly total: number;
  readonly firstTry: number;
  readonly daysOpened: number;
  readonly complete: boolean;
}

export function summarize(progress: SevenDaysProgress): SevenDaysSummary {
  const daysOpened = new Set(
    SEVEN_DAYS_LEVELS.filter((level) =>
      progress.cleared.includes(level.id),
    ).map((level) => level.day),
  ).size;
  return {
    cleared: progress.cleared.length,
    total: SEVEN_DAYS_LEVELS.length,
    firstTry: progress.firstTry.length,
    daysOpened,
    complete: progress.cleared.length === SEVEN_DAYS_LEVELS.length,
  };
}
