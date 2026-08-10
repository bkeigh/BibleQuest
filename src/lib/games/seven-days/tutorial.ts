/** The tutorial record is separate from game progress so it can evolve safely. */
export const SEVEN_DAYS_TUTORIAL_STORAGE_KEY =
  "biblequest:seven-days-match:tutorial:v1";

/** A schema version makes stale tutorial state fail closed after copy changes. */
export const SEVEN_DAYS_TUTORIAL_STORAGE_VERSION = 1;

/** Tutorial state should never grow beyond its two bounded scalar fields. */
const MAX_TUTORIAL_RECORD_LENGTH = 128;

interface SevenDaysTutorialState {
  readonly version: typeof SEVEN_DAYS_TUTORIAL_STORAGE_VERSION;
  readonly seen: true;
}

/** Returns browser storage when this device permits local persistence. */
function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Accepts only the small record written by this tutorial version. */
function sanitizeTutorialState(value: unknown): SevenDaysTutorialState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (
    Object.keys(entry).length !== 2 ||
    entry.version !== SEVEN_DAYS_TUTORIAL_STORAGE_VERSION ||
    entry.seen !== true
  ) {
    return null;
  }
  return {
    version: SEVEN_DAYS_TUTORIAL_STORAGE_VERSION,
    seen: true,
  };
}

/** Reads a valid seen marker and removes malformed or obsolete records. */
export function readSevenDaysTutorialSeen(storage?: Storage): boolean {
  const target = storage ?? browserStorage();
  if (!target) return false;
  try {
    const raw = target.getItem(SEVEN_DAYS_TUTORIAL_STORAGE_KEY);
    if (!raw) return false;
    const state =
      raw.length <= MAX_TUTORIAL_RECORD_LENGTH
        ? sanitizeTutorialState(JSON.parse(raw))
        : null;
    if (state) return state.seen;
    target.removeItem(SEVEN_DAYS_TUTORIAL_STORAGE_KEY);
  } catch {
    // Restricted storage leaves the tutorial available instead of blocking play.
  }
  return false;
}

/** Persists only a versioned boolean marker after the tips are completed. */
export function writeSevenDaysTutorialSeen(storage?: Storage): boolean {
  const target = storage ?? browserStorage();
  if (!target) return false;
  const state: SevenDaysTutorialState = {
    version: SEVEN_DAYS_TUTORIAL_STORAGE_VERSION,
    seen: true,
  };
  try {
    target.setItem(SEVEN_DAYS_TUTORIAL_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
