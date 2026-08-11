"use client";

/**
 * Records which account the local QuestOS store last synced with.
 *
 * Sign-out intentionally keeps the journey on the device. The owner marker is
 * therefore a privacy boundary: an unreadable or malformed marker must never
 * be treated as unowned guest data that a different account may adopt.
 */

export const LAST_SYNC_USER_STORAGE_KEY = "biblequest:last-sync-user";
export const LOCAL_JOURNEY_OWNER_QUARANTINE =
  "biblequest:owner-boundary-unavailable:v1";
const INITIAL_SYNC_PENDING_KEY = "biblequest:initial-sync-pending-user";
const LOCAL_CLAIM_PENDING_KEY = "biblequest:local-claim-pending-user";
const MAX_USER_ID_LENGTH = 128;

type OwnerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LocalJourneyOwner =
  | { status: "unowned" }
  | { status: "owned"; userId: string }
  | { status: "unavailable"; reason: "storage" | "corrupt" };

/** A content-free boundary error suitable for account lifecycle UI. */
export class LocalJourneyOwnershipError extends Error {
  constructor() {
    super("The local journey owner could not be stored safely.");
    this.name = "LocalJourneyOwnershipError";
  }
}

/** Resolve browser storage without making server rendering look corrupted. */
function ownerStorage(storage?: OwnerStorage): OwnerStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** Accept opaque Supabase IDs and test fixtures, but reject ambiguous values. */
export function isValidLocalJourneyUserId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_USER_ID_LENGTH &&
    value !== LOCAL_JOURNEY_OWNER_QUARANTINE &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/** Read the ownership boundary without collapsing storage failures into guest. */
export function readLocalJourneyOwner(storage?: OwnerStorage): LocalJourneyOwner {
  try {
    const resolved = ownerStorage(storage);
    if (!resolved) return { status: "unowned" };
    const value = resolved.getItem(LAST_SYNC_USER_STORAGE_KEY);
    if (value === null) return { status: "unowned" };
    if (!isValidLocalJourneyUserId(value)) {
      return { status: "unavailable", reason: "corrupt" };
    }
    return { status: "owned", userId: value };
  } catch {
    return { status: "unavailable", reason: "storage" };
  }
}

/** Legacy accessor keeps unknown ownership non-null so old callers fail closed. */
export function getLastSyncedUserId(): string | null {
  const owner = readLocalJourneyOwner();
  if (owner.status === "owned") return owner.userId;
  return owner.status === "unavailable"
    ? LOCAL_JOURNEY_OWNER_QUARANTINE
    : null;
}

/** Persist and read back the owner so silent quota failures cannot fail open. */
export function setLastSyncedUserId(
  userId: string,
  storage?: OwnerStorage,
): void {
  if (!isValidLocalJourneyUserId(userId)) {
    throw new LocalJourneyOwnershipError();
  }

  try {
    const resolved = ownerStorage(storage);
    if (!resolved) throw new LocalJourneyOwnershipError();
    resolved.setItem(LAST_SYNC_USER_STORAGE_KEY, userId);
    if (resolved.getItem(LAST_SYNC_USER_STORAGE_KEY) !== userId) {
      throw new LocalJourneyOwnershipError();
    }
  } catch (error) {
    if (error instanceof LocalJourneyOwnershipError) throw error;
    throw new LocalJourneyOwnershipError();
  }
}

/** Clear all owner-dependent markers and verify that none survived. */
export function clearLastSyncedUserId(storage?: OwnerStorage): void {
  const keys = [
    LAST_SYNC_USER_STORAGE_KEY,
    INITIAL_SYNC_PENDING_KEY,
    LOCAL_CLAIM_PENDING_KEY,
  ];

  try {
    const resolved = ownerStorage(storage);
    if (!resolved) return;
    for (const key of keys) resolved.removeItem(key);
    if (keys.some((key) => resolved.getItem(key) !== null)) {
      throw new LocalJourneyOwnershipError();
    }
  } catch (error) {
    if (error instanceof LocalJourneyOwnershipError) throw error;
    throw new LocalJourneyOwnershipError();
  }
}

/** Quarantine an unreadable protected mirror so it cannot become guest data. */
export function quarantineLocalJourneyOwner(storage?: OwnerStorage): void {
  try {
    const resolved = ownerStorage(storage);
    if (!resolved) throw new LocalJourneyOwnershipError();
    resolved.setItem(
      LAST_SYNC_USER_STORAGE_KEY,
      LOCAL_JOURNEY_OWNER_QUARANTINE,
    );
    if (
      resolved.getItem(LAST_SYNC_USER_STORAGE_KEY) !==
      LOCAL_JOURNEY_OWNER_QUARANTINE
    ) {
      throw new LocalJourneyOwnershipError();
    }
  } catch (error) {
    if (error instanceof LocalJourneyOwnershipError) throw error;
    throw new LocalJourneyOwnershipError();
  }
}

/** Store a user-bound marker and verify that it reached durable storage. */
function setUserMarker(key: string, userId: string): void {
  if (!isValidLocalJourneyUserId(userId)) {
    throw new LocalJourneyOwnershipError();
  }
  try {
    const storage = ownerStorage();
    if (!storage) throw new LocalJourneyOwnershipError();
    storage.setItem(key, userId);
    if (storage.getItem(key) !== userId) throw new LocalJourneyOwnershipError();
  } catch (error) {
    if (error instanceof LocalJourneyOwnershipError) throw error;
    throw new LocalJourneyOwnershipError();
  }
}

/** Clear only a marker that still belongs to the expected account. */
function clearUserMarker(key: string, userId: string): void {
  try {
    const storage = ownerStorage();
    if (!storage) return;
    if (storage.getItem(key) !== userId) return;
    storage.removeItem(key);
    if (storage.getItem(key) !== null) throw new LocalJourneyOwnershipError();
  } catch (error) {
    if (error instanceof LocalJourneyOwnershipError) throw error;
    throw new LocalJourneyOwnershipError();
  }
}

/** Read a user-bound marker while choosing its safe failure default. */
function userMarkerMatches(
  key: string,
  userId: string,
  storageFailureResult: boolean,
): boolean {
  try {
    const storage = ownerStorage();
    if (!storage) return false;
    const value = storage.getItem(key);
    if (value === null) return false;
    if (!isValidLocalJourneyUserId(value)) return storageFailureResult;
    return value === userId;
  } catch {
    return storageFailureResult;
  }
}

/** Mark a first restore pending before any account-owned data can be revealed. */
export function markInitialSyncPending(userId: string): void {
  setUserMarker(INITIAL_SYNC_PENDING_KEY, userId);
}

export function clearInitialSyncPending(userId: string): void {
  clearUserMarker(INITIAL_SYNC_PENDING_KEY, userId);
}

/** An unreadable pending marker must keep the restore boundary closed. */
export function initialSyncIsPending(userId: string): boolean {
  return userMarkerMatches(INITIAL_SYNC_PENDING_KEY, userId, true);
}

/** Remember an explicit keep-my-journey choice until its first sync succeeds. */
export function markLocalJourneyClaimPending(userId: string): void {
  setUserMarker(LOCAL_CLAIM_PENDING_KEY, userId);
}

/** A storage failure never grants local data authority to an account. */
export function localJourneyClaimIsPending(userId: string): boolean {
  return userMarkerMatches(LOCAL_CLAIM_PENDING_KEY, userId, false);
}

export function clearLocalJourneyClaimPending(userId: string): void {
  clearUserMarker(LOCAL_CLAIM_PENDING_KEY, userId);
}

/** Unknown ownership is a conflict, never an adoptable guest journey. */
export function localDataBelongsToOtherUser(userId: string): boolean {
  if (!isValidLocalJourneyUserId(userId)) return true;
  const owner = readLocalJourneyOwner();
  return owner.status === "unavailable" ||
    (owner.status === "owned" && owner.userId !== userId);
}
