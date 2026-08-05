"use client";

/**
 * A durable copy of the journey, outside the WebView.
 *
 * iOS treats script-writable WebView storage as reclaimable: under storage
 * pressure the system can purge localStorage and IndexedDB without warning and
 * without uninstalling the app. BibleQuest keeps the entire journey — prayers,
 * reflections, quests, streaks — in the single `biblequest:v1` localStorage
 * blob, and account sync is off by default, so there is no server copy to
 * restore from. Losing that is unrecoverable and invisible until a reader opens
 * the app to an empty history.
 *
 * The fix is deliberately conservative. localStorage stays the synchronous
 * primary, so store rehydration timing is untouched; this module only adds a
 * write-through copy in the app's Documents directory (which iOS does not
 * reclaim) and restores it when the primary comes up empty.
 *
 * It is not a sync engine. It never merges, and it never overwrites a
 * non-empty primary — a restore happens only when localStorage has nothing at
 * all, which is precisely the eviction case.
 */
import { isNativeTarget } from "@/lib/platform/target";

/** Must match the Zustand persist `name` in lib/questos/store.ts. */
export const JOURNEY_STORAGE_KEY = "biblequest:v1";

const BACKUP_FILE = "journey-backup.json";

/** Coalesces bursts of store writes into one file write. */
const WRITE_DEBOUNCE_MS = 1500;

type FilesystemModule = typeof import("@capacitor/filesystem");

let filesystem: FilesystemModule | null = null;

/**
 * Loaded lazily so the plugin never enters the web bundle. Returns null on web
 * and on any load failure — a backup is a safety net, and a failing net must
 * not take the app down with it.
 */
async function loadFilesystem(): Promise<FilesystemModule | null> {
  if (!isNativeTarget()) return null;
  if (filesystem) return filesystem;
  try {
    filesystem = await import("@capacitor/filesystem");
    return filesystem;
  } catch {
    return null;
  }
}

function readPrimary(): string | null {
  try {
    return window.localStorage.getItem(JOURNEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** A journey worth preserving — not absent, and not an empty JSON husk. */
function isSubstantive(raw: string | null): raw is string {
  return typeof raw === "string" && raw.length > 2;
}

/** Writes the current journey to the app's Documents directory. */
export async function writeJourneyBackup(): Promise<boolean> {
  const fs = await loadFilesystem();
  if (!fs) return false;

  const raw = readPrimary();
  if (!isSubstantive(raw)) return false;

  try {
    await fs.Filesystem.writeFile({
      path: BACKUP_FILE,
      data: raw,
      directory: fs.Directory.Data,
      encoding: fs.Encoding.UTF8,
    });
    return true;
  } catch {
    return false;
  }
}

/** Reads the mirrored journey, or null when there is none. */
export async function readJourneyBackup(): Promise<string | null> {
  const fs = await loadFilesystem();
  if (!fs) return null;

  try {
    const file = await fs.Filesystem.readFile({
      path: BACKUP_FILE,
      directory: fs.Directory.Data,
      encoding: fs.Encoding.UTF8,
    });
    const data = typeof file.data === "string" ? file.data : null;
    return isSubstantive(data) ? data : null;
  } catch {
    // A missing file is the normal first-launch case, not an error.
    return null;
  }
}

export type RestoreOutcome =
  | "not-native"
  | "primary-intact"
  | "no-backup"
  | "restored"
  | "failed";

/**
 * Repairs an evicted primary from the mirror. Call once, before the store
 * hydrates — afterwards the app has already rendered an empty journey.
 *
 * Never overwrites existing data: if localStorage still holds a journey, the
 * mirror is refreshed from it instead.
 */
export async function restoreJourneyIfEvicted(): Promise<RestoreOutcome> {
  if (!isNativeTarget()) return "not-native";

  if (isSubstantive(readPrimary())) {
    // Healthy launch. Take the opportunity to refresh the mirror.
    void writeJourneyBackup();
    return "primary-intact";
  }

  const backup = await readJourneyBackup();
  if (!backup) return "no-backup";

  try {
    // Parsed first so a truncated or corrupt mirror can never replace a valid
    // empty state with something the store cannot rehydrate.
    JSON.parse(backup);
    window.localStorage.setItem(JOURNEY_STORAGE_KEY, backup);
    return "restored";
  } catch {
    return "failed";
  }
}

/**
 * Mirrors the journey whenever it changes, debounced, plus once more when the
 * app is backgrounded — the last moment before iOS may suspend or reclaim.
 * Returns a cleanup function.
 */
export function startJourneyBackup(): () => void {
  if (!isNativeTarget() || typeof window === "undefined") return () => {};

  let timer: number | null = null;
  let disposed = false;

  const schedule = () => {
    if (disposed) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void writeJourneyBackup();
    }, WRITE_DEBOUNCE_MS);
  };

  const flush = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    void writeJourneyBackup();
  };

  // `storage` fires for other documents, not this one, so the store's own
  // writes are observed by patching setItem for our single key.
  const nativeSetItem = window.localStorage.setItem.bind(window.localStorage);
  const patched = (key: string, value: string) => {
    nativeSetItem(key, value);
    if (key === JOURNEY_STORAGE_KEY) schedule();
  };
  window.localStorage.setItem = patched as typeof window.localStorage.setItem;

  // Backgrounding is the last moment before iOS may suspend or reclaim, so
  // flush there too. Both listeners are optional — the debounced write above
  // is the primary path, and a missing document must not break mirroring.
  const onHide = () => {
    if (document.visibilityState === "hidden") flush();
  };
  const hasDocument = typeof document !== "undefined";
  if (hasDocument) document.addEventListener("visibilitychange", onHide);
  window.addEventListener?.("pagehide", flush);

  // One write at startup so a first session is protected before any edit.
  schedule();

  return () => {
    disposed = true;
    if (timer !== null) window.clearTimeout(timer);
    if (window.localStorage.setItem === patched) {
      window.localStorage.setItem = nativeSetItem;
    }
    if (hasDocument) document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener?.("pagehide", flush);
  };
}
