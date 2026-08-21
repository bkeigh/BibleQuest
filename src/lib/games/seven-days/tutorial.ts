import {
  removeDevicePrivateStorageItem as removeWebPrivateStorageItem,
  setDevicePrivateStorageItem as setWebPrivateStorageItem,
  devicePrivateStorageReadAllowed as webPrivateStorageReadAllowed,
} from "@/lib/storage/device-private-write";
import {
  DEVICE_SEVEN_DAYS_TUTORIAL_STORAGE_KEY as LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
  PROTECTED_SEVEN_DAYS_TUTORIAL_STORAGE_KEY as WEB_V2_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
  selectDevicePrivateStorageKey as selectedWebPrivateStorageKey,
} from "@/lib/storage/device-private-storage";

/** The tutorial record is separate from game progress so it can evolve safely. */
export const SEVEN_DAYS_TUTORIAL_STORAGE_KEY =
  LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY;

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

/** Resolves the atomically selected guest or installed-account namespace. */
export function sevenDaysTutorialStorageKey(storage: Storage): string | null {
  return selectedWebPrivateStorageKey(
    storage,
    LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
    WEB_V2_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
  );
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
    if (!webPrivateStorageReadAllowed(target, storage !== undefined)) {
      return false;
    }
    const key = sevenDaysTutorialStorageKey(target);
    if (!key) return false;
    const raw = target.getItem(key);
    if (
      !webPrivateStorageReadAllowed(target, storage !== undefined) ||
      !raw
    ) {
      return false;
    }
    const state =
      raw.length <= MAX_TUTORIAL_RECORD_LENGTH
        ? sanitizeTutorialState(JSON.parse(raw))
        : null;
    if (
      state &&
      webPrivateStorageReadAllowed(target, storage !== undefined)
    ) {
      return state.seen;
    }
    if (!webPrivateStorageReadAllowed(target, storage !== undefined)) {
      return false;
    }
    void removeWebPrivateStorageItem(target, key, storage !== undefined, raw);
  } catch {
    // Restricted storage leaves the tutorial available instead of blocking play.
  }
  return false;
}

/** Persists only a versioned boolean marker after the tips are completed. */
export function writeSevenDaysTutorialSeen(
  storage?: Storage,
): Promise<boolean> {
  const target = storage ?? browserStorage();
  if (!target) return Promise.resolve(false);
  const key = sevenDaysTutorialStorageKey(target);
  if (!key) return Promise.resolve(false);
  const state: SevenDaysTutorialState = {
    version: SEVEN_DAYS_TUTORIAL_STORAGE_VERSION,
    seen: true,
  };
  return setWebPrivateStorageItem(
    target,
    key,
    JSON.stringify(state),
    storage !== undefined,
  );
}
