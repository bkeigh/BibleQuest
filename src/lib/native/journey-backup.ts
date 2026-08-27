"use client";

/**
 * A durable copy of the journey outside reclaimable WebView storage.
 *
 * Guest releases retain the original raw-file format. The native account beta
 * writes one versioned envelope instead, so the protected journey and its exact
 * owner stamp are committed and restored as one filesystem value.
 */
import { isNativeTarget } from "@/lib/platform/target";
import { withDeadline } from "@/lib/async/deadline";
import { NATIVE_ACCOUNT_BETA_ENABLED } from "@/lib/sync/containment";
import {
  LAST_SYNC_USER_STORAGE_KEY,
  clearLastSyncedUserId,
  isValidLocalJourneyUserId,
  quarantineLocalJourneyOwner,
  readLocalJourneyOwner,
  setLastSyncedUserId,
} from "@/lib/sync/last-user";

/** Must match the Zustand persist `name` in lib/questos/store.ts. */
export const JOURNEY_STORAGE_KEY = "biblequest:v1";
export const NATIVE_JOURNEY_READ_DEADLINE_MS = 12_000;

const BACKUP_FILE = "journey-backup.json";
const BACKUP_ENVELOPE_KIND = "biblequest-native-journey-backup";
const BACKUP_ENVELOPE_VERSION = 1;
const WRITE_DEBOUNCE_MS = 1500;

type FilesystemModule = typeof import("@capacitor/filesystem");

interface BackupEnvelope {
  kind: typeof BACKUP_ENVELOPE_KIND;
  version: typeof BACKUP_ENVELOPE_VERSION;
  ownerUserId: string | null;
  journey: Record<string, unknown>;
}

type BackupRecord =
  | { status: "missing" }
  | { status: "unavailable" }
  | { status: "corrupt"; protectedEnvelope: boolean }
  | {
      status: "ready";
      journey: string;
      ownerUserId: string | null;
      legacyGuest: boolean;
    };

type PrimaryRecord =
  | { status: "missing" }
  | { status: "unavailable" }
  | { status: "ready"; journey: string };

let filesystem: FilesystemModule | null = null;
let filesystemMutation: Promise<void> = Promise.resolve();
let backupWritesSuspended = false;
let backupGeneration = 0;

/** Runs one filesystem mutation after every earlier mutation has settled. */
function serializeFilesystemMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = filesystemMutation.then(operation, operation);
  filesystemMutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Native account ownership metadata is absent from the guest release path. */
function accountOwnerEnvelopeRequired(): boolean {
  return isNativeTarget() && NATIVE_ACCOUNT_BETA_ENABLED;
}

/** Load the filesystem lazily so web and failed native plugins remain inert. */
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

/** Read the primary without making a denied storage access look empty. */
function readPrimary(): PrimaryRecord {
  try {
    const raw = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
    return isSubstantive(raw)
      ? { status: "ready", journey: raw }
      : { status: "missing" };
  } catch {
    return { status: "unavailable" };
  }
}

/** A journey worth preserving is neither absent nor an empty JSON tombstone. */
function isSubstantive(raw: string | null): raw is string {
  return typeof raw === "string" && raw.length > 2;
}

/** Parse one journey object without accepting arrays or scalar JSON. */
function parseJourneyObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Decode either the account-safe envelope or a pre-beta guest backup. */
function parseBackupFile(raw: string | null): BackupRecord {
  if (!isSubstantive(raw)) return { status: "missing" };
  const advertisesEnvelope = raw.includes(BACKUP_ENVELOPE_KIND);
  const parsed = parseJourneyObject(raw);
  if (!parsed) {
    return { status: "corrupt", protectedEnvelope: advertisesEnvelope };
  }

  if (parsed.kind !== BACKUP_ENVELOPE_KIND) {
    return {
      status: "ready",
      journey: raw,
      ownerUserId: null,
      legacyGuest: true,
    };
  }

  const keys = Object.keys(parsed).sort().join(",");
  const owner = parsed.ownerUserId;
  const journey = parsed.journey;
  if (
    keys !== "journey,kind,ownerUserId,version" ||
    parsed.version !== BACKUP_ENVELOPE_VERSION ||
    (owner !== null &&
      (typeof owner !== "string" || !isValidLocalJourneyUserId(owner))) ||
    !journey ||
    typeof journey !== "object" ||
    Array.isArray(journey)
  ) {
    return { status: "corrupt", protectedEnvelope: true };
  }

  const encodedJourney = JSON.stringify(journey);
  if (!isSubstantive(encodedJourney)) {
    return { status: "corrupt", protectedEnvelope: true };
  }
  return {
    status: "ready",
    journey: encodedJourney,
    ownerUserId: owner as string | null,
    legacyGuest: false,
  };
}

/** Encode an account-beta journey and its strict owner in one protected value. */
function encodeBackup(raw: string): string | null {
  if (!accountOwnerEnvelopeRequired()) return raw;
  const journey = parseJourneyObject(raw);
  const owner = readLocalJourneyOwner();
  if (!journey || owner.status === "unavailable") return null;

  const envelope: BackupEnvelope = {
    kind: BACKUP_ENVELOPE_KIND,
    version: BACKUP_ENVELOPE_VERSION,
    ownerUserId: owner.status === "owned" ? owner.userId : null,
    journey,
  };
  return JSON.stringify(envelope);
}

/** Read and classify the protected file without collapsing corruption to none. */
async function readBackupRecord(): Promise<BackupRecord> {
  if (!isNativeTarget()) return { status: "missing" };
  const fs = await loadFilesystem();
  if (!fs) return { status: "unavailable" };
  try {
    // A wedged plugin read has no side effects, so it can be bounded without
    // allowing a late completion to mutate or expose journey state.
    const file = await withDeadline(
      fs.Filesystem.readFile({
        path: BACKUP_FILE,
        directory: fs.Directory.Data,
        encoding: fs.Encoding.UTF8,
      }),
      NATIVE_JOURNEY_READ_DEADLINE_MS,
      "Native journey restore",
    );
    return parseBackupFile(typeof file.data === "string" ? file.data : null);
  } catch (error) {
    return error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "OS-PLUG-FILE-0008"
      ? { status: "missing" }
      : { status: "unavailable" };
  }
}

/** Quarantine a malformed account mirror and prevent an automatic overwrite. */
async function quarantineProtectedMirror(): Promise<void> {
  backupWritesSuspended = true;
  try {
    await quarantineLocalJourneyOwner();
  } catch {
    // Storage is already unavailable; suspension still preserves the mirror.
  }
}

/** Writes the current journey to the app's protected Data directory. */
export async function writeJourneyBackup(): Promise<boolean> {
  const primary = readPrimary();
  const generation = backupGeneration;
  if (backupWritesSuspended || primary.status !== "ready") return false;
  const encoded = encodeBackup(primary.journey);
  if (!encoded) return false;

  return serializeFilesystemMutation(async () => {
    if (backupWritesSuspended || generation !== backupGeneration) return false;
    const fs = await loadFilesystem();
    if (!fs || backupWritesSuspended || generation !== backupGeneration) {
      return false;
    }
    try {
      await fs.Filesystem.writeFile({
        path: BACKUP_FILE,
        data: encoded,
        directory: fs.Directory.Data,
        encoding: fs.Encoding.UTF8,
      });
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Durably bind the current native beta mirror to one expected account.
 * The sync engine should await this after stamping ownership and before it can
 * treat account-owned local data as safely recoverable.
 */
export async function sealJourneyBackupOwner(
  expectedUserId: string,
): Promise<boolean> {
  if (!accountOwnerEnvelopeRequired()) return true;
  const owner = readLocalJourneyOwner();
  const primary = readPrimary();
  if (
    owner.status !== "owned" ||
    owner.userId !== expectedUserId ||
    primary.status !== "ready" ||
    !(await writeJourneyBackup())
  ) {
    return false;
  }

  const record = await readBackupRecord();
  return (
    record.status === "ready" &&
    !record.legacyGuest &&
    record.ownerUserId === expectedUserId &&
    record.journey === primary.journey
  );
}

/**
 * Tombstone the mirror before any irreversible local clear or account handoff.
 * A failed delete remains safe because the two-byte file is non-restorable.
 */
export async function purgeJourneyBackup(): Promise<boolean> {
  if (!isNativeTarget()) return true;

  const wasSuspended = backupWritesSuspended;
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
      // The durable tombstone already makes this mirror non-restorable.
    }
    return true;
  });

  if (!purged) backupWritesSuspended = wasSuspended;
  return purged;
}

/** Resume writes only after the caller has reset the primary and owner marker. */
export function resumeJourneyBackupAfterPurge(): void {
  backupWritesSuspended = false;
}

/** Reads the mirrored journey body while hiding its account metadata. */
export async function readJourneyBackup(): Promise<string | null> {
  const record = await readBackupRecord();
  return record.status === "ready" ? record.journey : null;
}

export type RestoreOutcome =
  | "not-native"
  | "primary-intact"
  | "no-backup"
  | "restored"
  | "failed";

/** Restore one owner-stamped account journey or one compatible legacy guest. */
export async function restoreJourneyIfEvicted(): Promise<RestoreOutcome> {
  if (!isNativeTarget()) return "not-native";
  const primary = readPrimary();
  if (primary.status === "unavailable") {
    backupWritesSuspended = true;
    return "failed";
  }

  if (primary.status === "ready") {
    if (accountOwnerEnvelopeRequired()) {
      const owner = readLocalJourneyOwner();
      if (owner.status === "unavailable") {
        backupWritesSuspended = true;
        return "failed";
      }

      // Recover a selectively evicted owner key only when the protected body is
      // byte-for-byte the same journey. A mismatch is ambiguous and quarantined.
      if (owner.status === "unowned") {
        const backup = await readBackupRecord();
        if (
          backup.status === "ready" &&
          !backup.legacyGuest &&
          backup.ownerUserId !== null
        ) {
          if (backup.journey !== primary.journey) {
            await quarantineProtectedMirror();
            return "failed";
          }
          try {
            await setLastSyncedUserId(backup.ownerUserId);
          } catch {
            backupWritesSuspended = true;
            return "failed";
          }
        } else if (backup.status === "corrupt" && backup.protectedEnvelope) {
          await quarantineProtectedMirror();
          return "failed";
        } else if (backup.status === "unavailable") {
          backupWritesSuspended = true;
          return "failed";
        }
      }
    }

    // The primary is authoritative; refresh its mirror without delaying launch.
    void writeJourneyBackup();
    return "primary-intact";
  }

  const backup = await readBackupRecord();
  if (backup.status === "missing") return "no-backup";
  if (backup.status === "unavailable") {
    backupWritesSuspended = true;
    return "failed";
  }
  if (backup.status === "corrupt") {
    if (accountOwnerEnvelopeRequired()) await quarantineProtectedMirror();
    return "failed";
  }

  try {
    // The filesystem read is asynchronous. Never overwrite a primary or owner
    // that became authoritative while it was in flight.
    const currentPrimary = readPrimary();
    if (currentPrimary.status === "unavailable") {
      backupWritesSuspended = true;
      return "failed";
    }
    if (currentPrimary.status === "ready") {
      return restoreJourneyIfEvicted();
    }
    if (accountOwnerEnvelopeRequired()) {
      const currentOwner = readLocalJourneyOwner();
      if (
        currentOwner.status === "unavailable" ||
        (currentOwner.status === "owned" &&
          (backup.legacyGuest ||
            backup.ownerUserId === null ||
            currentOwner.userId !== backup.ownerUserId))
      ) {
        backupWritesSuspended = true;
        return "failed";
      }
      // Owner first: a crash between the two localStorage writes leaves no
      // account journey exposed as unowned guest data.
      if (
        currentOwner.status === "unowned" &&
        !backup.legacyGuest &&
        backup.ownerUserId !== null
      ) {
        await setLastSyncedUserId(backup.ownerUserId);
      } else if (currentOwner.status === "unowned") {
        await clearLastSyncedUserId();
      }
    }
    window.localStorage.setItem(JOURNEY_STORAGE_KEY, backup.journey);
    if (window.localStorage.getItem(JOURNEY_STORAGE_KEY) !== backup.journey) {
      return "failed";
    }
    return "restored";
  } catch {
    return "failed";
  }
}

/** Mirror store and owner writes, plus flush before iOS backgrounds the app. */
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

  // The owner key flushes immediately so an account claim is sealed as soon as
  // possible. The engine still awaits sealJourneyBackupOwner for strict proof.
  const nativeSetItem = window.localStorage.setItem.bind(window.localStorage);
  const patched = (key: string, value: string) => {
    nativeSetItem(key, value);
    if (key === LAST_SYNC_USER_STORAGE_KEY) flush();
    else if (key === JOURNEY_STORAGE_KEY) schedule();
  };
  window.localStorage.setItem = patched as typeof window.localStorage.setItem;

  const onHide = () => {
    if (document.visibilityState === "hidden") flush();
  };
  const hasDocument = typeof document !== "undefined";
  if (hasDocument) document.addEventListener("visibilitychange", onHide);
  window.addEventListener?.("pagehide", flush);

  // Protect the first hydrated session even if it makes no later store edit.
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
