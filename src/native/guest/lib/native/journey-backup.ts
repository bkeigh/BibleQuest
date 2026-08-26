"use client";

import { isNativeTarget } from "@/lib/platform/target";
import { withDeadline } from "@/lib/async/deadline";

/** Matches the one device-local Zustand journey key. */
export const JOURNEY_STORAGE_KEY = "biblequest:v1";
export const NATIVE_JOURNEY_READ_DEADLINE_MS = 12_000;

const BACKUP_FILE = "journey-backup.json";
const WRITE_DEBOUNCE_MS = 1_500;

type FilesystemModule = typeof import("@capacitor/filesystem");

let filesystem: FilesystemModule | null = null;
let filesystemMutation: Promise<void> = Promise.resolve();
let backupWritesSuspended = false;
let backupGeneration = 0;

/** Runs one filesystem mutation after every earlier mutation settles. */
function serializeFilesystemMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = filesystemMutation.then(operation, operation);
  filesystemMutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Loads the native filesystem only when the device needs it. */
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

/** Reads the device journey without treating denied storage as empty data. */
function readPrimary(): string | null {
  try {
    return window.localStorage.getItem(JOURNEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Accepts only a nonempty JSON object as a journey worth preserving. */
function validJourney(raw: string | null): raw is string {
  if (typeof raw !== "string" || raw.length <= 2) return false;
  try {
    const value: unknown = JSON.parse(raw);
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  } catch {
    return false;
  }
}

/** Writes the exact device journey into the protected app directory. */
export async function writeJourneyBackup(): Promise<boolean> {
  const raw = readPrimary();
  const generation = backupGeneration;
  if (backupWritesSuspended || !validJourney(raw)) return false;

  return serializeFilesystemMutation(async () => {
    if (backupWritesSuspended || generation !== backupGeneration) return false;
    const fs = await loadFilesystem();
    if (!fs || backupWritesSuspended || generation !== backupGeneration) {
      return false;
    }
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
  });
}

/** Refuses owner sealing because this build has no remote owner. */
export async function sealJourneyBackupOwner(
  expectedUserId: string,
): Promise<boolean> {
  void expectedUserId;
  return false;
}

/** Tombstones and deletes the protected copy before local clearing begins. */
export async function purgeJourneyBackup(): Promise<boolean> {
  if (!isNativeTarget()) return true;
  backupWritesSuspended = true;
  backupGeneration += 1;

  const purged = await serializeFilesystemMutation(async () => {
    const fs = await loadFilesystem();
    if (!fs) return false;
    try {
      await fs.Filesystem.writeFile({
        path: BACKUP_FILE,
        data: "{}",
        directory: fs.Directory.Data,
        encoding: fs.Encoding.UTF8,
      });
    } catch {
      return false;
    }
    try {
      await fs.Filesystem.deleteFile({
        path: BACKUP_FILE,
        directory: fs.Directory.Data,
      });
    } catch {
      // The non-restorable tombstone already protects the cleared journey.
    }
    return true;
  });

  if (!purged) backupWritesSuspended = false;
  return purged;
}

/** Re-enables mirror writes after the primary journey has been reset. */
export function resumeJourneyBackupAfterPurge(): void {
  backupWritesSuspended = false;
}

/** Reads one valid raw journey from the protected app directory. */
export async function readJourneyBackup(): Promise<string | null> {
  const fs = await loadFilesystem();
  if (!fs) return null;
  try {
    // A wedged plugin read has no side effects, so it can be bounded without
    // allowing a late completion to mutate the guest journey.
    const file = await withDeadline(
      fs.Filesystem.readFile({
        path: BACKUP_FILE,
        directory: fs.Directory.Data,
        encoding: fs.Encoding.UTF8,
      }),
      NATIVE_JOURNEY_READ_DEADLINE_MS,
      "Native journey restore",
    );
    const data = typeof file.data === "string" ? file.data : null;
    return validJourney(data) ? data : null;
  } catch {
    return null;
  }
}

export type RestoreOutcome =
  | "not-native"
  | "primary-intact"
  | "no-backup"
  | "restored"
  | "failed";

/** Restores only when the primary is empty and the protected copy is valid. */
export async function restoreJourneyIfEvicted(): Promise<RestoreOutcome> {
  if (!isNativeTarget()) return "not-native";
  if (validJourney(readPrimary())) {
    void writeJourneyBackup();
    return "primary-intact";
  }

  const backup = await readJourneyBackup();
  if (!backup) return "no-backup";
  try {
    window.localStorage.setItem(JOURNEY_STORAGE_KEY, backup);
    return window.localStorage.getItem(JOURNEY_STORAGE_KEY) === backup
      ? "restored"
      : "failed";
  } catch {
    return "failed";
  }
}

/** Mirrors later journey writes and flushes once before the app is hidden. */
export function startJourneyBackup(): () => void {
  if (!isNativeTarget() || typeof window === "undefined") return () => {};

  let timer: number | null = null;
  let disposed = false;

  /** Coalesces quick local edits into one protected write. */
  const schedule = () => {
    if (disposed) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void writeJourneyBackup();
    }, WRITE_DEBOUNCE_MS);
  };

  /** Flushes the latest journey before the native view can be suspended. */
  const flush = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    void writeJourneyBackup();
  };

  const nativeSetItem = window.localStorage.setItem.bind(window.localStorage);
  /** Observes only writes to the one local journey key. */
  const patched = (key: string, value: string) => {
    nativeSetItem(key, value);
    if (key === JOURNEY_STORAGE_KEY) schedule();
  };
  window.localStorage.setItem = patched as typeof window.localStorage.setItem;

  /** Flushes when the document moves into the background. */
  const onHide = () => {
    if (document.visibilityState === "hidden") flush();
  };
  const hasDocument = typeof document !== "undefined";
  if (hasDocument) document.addEventListener("visibilitychange", onHide);
  window.addEventListener?.("pagehide", flush);
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
