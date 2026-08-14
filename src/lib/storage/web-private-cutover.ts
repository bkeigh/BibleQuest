"use client";

import {
  beginWebPrivateWrite,
  reviewedWebPrivateWriteRemovalAllowed,
  terminalWebPrivateWriteRemovalAllowed,
  webPrivateActiveResetCommitAllowed,
  webPrivateFreshInstallResetAllowed,
  webPrivateInstallCutoverAllowed,
  webPrivateLegacyGuestRecoveryAllowed,
  webPrivateLegacyAbsenceAuditAllowed,
  webPrivateNeverOwnedGuestProvenanceAllowed,
  webPrivateWriteGuardIsCurrent,
  withWebAuthStorageLock,
  type WebAccountOperationHandle,
} from "@/lib/supabase/web-auth-storage";
import { readWebPrivateNamespaceState } from "./web-private-namespace";
import {
  LEGACY_AVATAR_DATABASE_NAME,
  LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
  LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY,
  LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
  LEGACY_LAST_SYNC_USER_STORAGE_KEY,
  LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY,
  WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
  WEB_PRIVATE_CUTOVER_PREPARED,
  WEB_PRIVATE_CUTOVER_STAGING,
  WEB_PRIVATE_FIXED_STORAGE_KEY_PAIRS,
  WEB_PRIVATE_GUEST_CLEAR_IN_PROGRESS,
  WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY,
  WEB_PRIVATE_HANDOFF_CONTRACT_COMPLETE,
  WEB_PRIVATE_LEGACY_REMOVAL_ONLY_KEYS,
  WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
  WEB_PRIVATE_NAMESPACE_V2_MARKER,
  WEB_PRIVATE_NEVER_OWNED_VALUE,
  WEB_PRIVATE_V2_REMOVAL_ONLY_KEYS,
  WEB_V2_AVATAR_DATABASE_NAME,
  WEB_V2_GUEST_PROVENANCE_STORAGE_KEY,
  WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY,
  WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY,
  WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
  WEB_V2_LAST_SYNC_USER_STORAGE_KEY,
  WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY,
  readWebPrivateGuestClearState,
} from "./web-private-namespace";

const AVATAR_STORE = "images";
const MAX_LOCAL_STORAGE_KEYS = 512;
const MAX_PRIVATE_VALUE_CHARACTERS = 5_000_000;
const MAX_PRIVATE_TOTAL_CHARACTERS = 6_000_000;
const MAX_JOURNAL_DRAFTS = 64;
const MAX_JOURNAL_KEY_CHARACTERS = 512;
const MAX_JOURNAL_VALUE_CHARACTERS = 256_000;
const MAX_AVATAR_ENTRIES = 32;
const MAX_AVATAR_KEY_CHARACTERS = 256;
const MAX_AVATAR_BYTES = 1024 * 1024;
const MAX_AVATAR_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_USER_ID_CHARACTERS = 128;
const OWNER_QUARANTINE = "biblequest:owner-boundary-unavailable:v1";

export type LegacyWebPrivateCutoverResult =
  | "already-committed"
  | "committed"
  | "unavailable";

export type WebPrivateSourceOwnerDisposition =
  | "ambiguous-unowned"
  | "exact-owner"
  | "other-owner"
  | "unavailable"
  | "unowned";

export type LegacyWebPrivateCutoverState =
  | "committed"
  | "none"
  | "prepared"
  | "staging"
  | "unavailable";

type CutoverStorage = Pick<
  Storage,
  "getItem" | "key" | "length" | "removeItem" | "setItem"
>;

/** Reads only the content-free crash-recovery phase for bootstrap routing. */
export function readLegacyWebPrivateCutoverState(
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): LegacyWebPrivateCutoverState {
  if (!storage) return "unavailable";
  try {
    if (readWebPrivateGuestClearState(storage) !== "none") {
      return "unavailable";
    }
    const marker = storage.getItem(WEB_PRIVATE_NAMESPACE_V2_MARKER);
    if (marker === WEB_PRIVATE_NAMESPACE_V2_COMPLETE) return "committed";
    if (marker !== null) return "unavailable";
    const phase = storage.getItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY);
    if (phase === null) return "none";
    if (phase === WEB_PRIVATE_CUTOVER_STAGING) return "staging";
    return phase === WEB_PRIVATE_CUTOVER_PREPARED
      ? "prepared"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Resolves the complete localStorage surface only inside the browser. */
function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Enumerates a fixed prefix without retaining any private values in metadata. */
function keysWithPrefix(
  storage: CutoverStorage,
  prefix: string,
): string[] | null {
  if (storage.length > MAX_LOCAL_STORAGE_KEYS) return null;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`${prefix}:`)) continue;
    if (
      key.length > MAX_JOURNAL_KEY_CHARACTERS ||
      keys.length >= MAX_JOURNAL_DRAFTS
    ) {
      return null;
    }
    keys.push(key);
  }
  return keys.sort();
}

/** Rejects malformed or quarantined identifiers before any private copy. */
function validSourceUserId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_USER_ID_CHARACTERS &&
    value !== OWNER_QUARANTINE &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/** Classifies a content-free source owner without exposing its identifier. */
function sourceOwnerDisposition(
  rawOwner: string | null,
  rawGuestProvenance: string | null,
  expectedUserId: string,
): WebPrivateSourceOwnerDisposition {
  if (!validSourceUserId(expectedUserId)) return "unavailable";
  if (
    rawGuestProvenance !== null &&
    rawGuestProvenance !== WEB_PRIVATE_NEVER_OWNED_VALUE
  ) {
    return "unavailable";
  }
  if (rawOwner === null) {
    return rawGuestProvenance === WEB_PRIVATE_NEVER_OWNED_VALUE
      ? "unowned"
      : "ambiguous-unowned";
  }
  if (rawGuestProvenance !== null) return "unavailable";
  if (!validSourceUserId(rawOwner)) return "unavailable";
  return rawOwner === expectedUserId ? "exact-owner" : "other-owner";
}

/** Reads the source side selected by the content-free cutover phase. */
function currentSourceOwnerDisposition(
  storage: CutoverStorage,
  expectedUserId: string,
): WebPrivateSourceOwnerDisposition {
  const state = readLegacyWebPrivateCutoverState(storage);
  if (state === "unavailable") return "unavailable";
  const ownerKey =
    state === "prepared" || state === "committed"
      ? WEB_V2_LAST_SYNC_USER_STORAGE_KEY
      : LEGACY_LAST_SYNC_USER_STORAGE_KEY;
  const provenanceKey =
    state === "prepared" || state === "committed"
      ? WEB_V2_GUEST_PROVENANCE_STORAGE_KEY
      : LEGACY_GUEST_PROVENANCE_STORAGE_KEY;
  return sourceOwnerDisposition(
    storage.getItem(ownerKey),
    storage.getItem(provenanceKey),
    expectedUserId,
  );
}

/** Copies every fixed value and proves each destination byte-for-byte. */
function stageFixedLocalStorage(
  storage: CutoverStorage,
  authorizationIsCurrent: () => boolean,
): number | null {
  let totalCharacters = 0;
  for (const [legacyKey, v2Key] of WEB_PRIVATE_FIXED_STORAGE_KEY_PAIRS) {
    if (!authorizationIsCurrent()) return null;
    const source = storage.getItem(legacyKey);
    if (
      source !== null &&
      source.length > MAX_PRIVATE_VALUE_CHARACTERS
    ) {
      return null;
    }
    totalCharacters += source?.length ?? 0;
    if (totalCharacters > MAX_PRIVATE_TOTAL_CHARACTERS) return null;
    if (source === null) storage.removeItem(v2Key);
    else storage.setItem(v2Key, source);
    if (
      !authorizationIsCurrent() ||
      storage.getItem(v2Key) !== source
    ) {
      return null;
    }
  }
  for (const key of WEB_PRIVATE_V2_REMOVAL_ONLY_KEYS) {
    if (!authorizationIsCurrent()) return null;
    storage.removeItem(key);
    if (!authorizationIsCurrent() || storage.getItem(key) !== null) {
      return null;
    }
  }
  return totalCharacters;
}

/** Copies the dynamic journal namespace after removing stale v2-only drafts. */
function stageJournalLocalStorage(
  storage: CutoverStorage,
  startingCharacters: number,
  authorizationIsCurrent: () => boolean,
): boolean {
  const staleV2Keys = keysWithPrefix(
    storage,
    WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
  );
  if (!staleV2Keys) return false;
  for (const key of staleV2Keys) {
    if (!authorizationIsCurrent()) return false;
    storage.removeItem(key);
    if (!authorizationIsCurrent() || storage.getItem(key) !== null) {
      return false;
    }
  }
  const legacyKeys = keysWithPrefix(
    storage,
    LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
  );
  if (!legacyKeys) return false;
  let totalCharacters = startingCharacters;
  for (const legacyKey of legacyKeys) {
    if (!authorizationIsCurrent()) return false;
    const source = storage.getItem(legacyKey);
    if (source === null) continue;
    if (source.length > MAX_JOURNAL_VALUE_CHARACTERS) return false;
    totalCharacters += source.length;
    if (totalCharacters > MAX_PRIVATE_TOTAL_CHARACTERS) return false;
    const suffix = legacyKey.slice(LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX.length);
    const v2Key = `${WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX}${suffix}`;
    storage.setItem(v2Key, source);
    if (!authorizationIsCurrent() || storage.getItem(v2Key) !== source) {
      return false;
    }
  }
  return authorizationIsCurrent();
}

/** Removes every ed28-readable localStorage value after v2 staging succeeds. */
function removeLegacyLocalStorage(
  storage: CutoverStorage,
  authorizationIsCurrent: () => boolean,
): boolean {
  const journalKeys = keysWithPrefix(
    storage,
    LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
  );
  if (!journalKeys) return false;
  const legacyKeys = [
    ...WEB_PRIVATE_FIXED_STORAGE_KEY_PAIRS.map(([legacyKey]) => legacyKey),
    ...WEB_PRIVATE_LEGACY_REMOVAL_ONLY_KEYS,
    ...journalKeys,
  ];
  for (const key of new Set(legacyKeys)) {
    if (!authorizationIsCurrent()) return false;
    storage.removeItem(key);
    if (storage.getItem(key) !== null) return false;
  }
  return true;
}

/** Opens one private avatar database and creates only its fixed object store. */
function openAvatarDatabase(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(AVATAR_STORE)) {
          request.result.createObjectStore(AVATAR_STORE);
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Reads every avatar entry without exposing its key or bytes outside memory. */
function readAvatarEntries(
  database: IDBDatabase,
): Promise<Array<readonly [string, Blob]> | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Array<readonly [string, Blob]> | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const transaction = database.transaction(AVATAR_STORE, "readonly");
      const store = transaction.objectStore(AVATAR_STORE);
      const entries: Array<readonly [string, Blob]> = [];
      let totalBytes = 0;
      const count = store.count();
      count.onsuccess = () => {
        if (count.result > MAX_AVATAR_ENTRIES) {
          transaction.abort();
          return;
        }
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const key = cursor.key;
          const value = cursor.value;
          if (
            typeof key !== "string" ||
            key.length > MAX_AVATAR_KEY_CHARACTERS ||
            !(value instanceof Blob) ||
            value.size > MAX_AVATAR_BYTES ||
            totalBytes + value.size > MAX_AVATAR_TOTAL_BYTES
          ) {
            transaction.abort();
            return;
          }
          totalBytes += value.size;
          entries.push([key, value]);
          cursor.continue();
        };
        cursorRequest.onerror = () => transaction.abort();
      };
      count.onerror = () => transaction.abort();
      transaction.oncomplete = () => finish(entries);
      transaction.onerror = () => finish(null);
      transaction.onabort = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

/** Replaces the v2 avatar store atomically with the staged legacy entries. */
function replaceAvatarEntries(
  database: IDBDatabase,
  entries: ReadonlyArray<readonly [string, Blob]>,
  authorizationIsCurrent: () => boolean,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!authorizationIsCurrent()) return resolve(false);
      const transaction = database.transaction(AVATAR_STORE, "readwrite");
      const store = transaction.objectStore(AVATAR_STORE);
      store.clear();
      for (const [key, blob] of entries) store.put(blob, key);
      transaction.oncomplete = () => resolve(authorizationIsCurrent());
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Compares staged avatar entries without logging private media or identifiers. */
async function avatarEntriesMatch(
  expected: ReadonlyArray<readonly [string, Blob]>,
  actual: ReadonlyArray<readonly [string, Blob]>,
  authorizationIsCurrent: () => boolean,
): Promise<boolean> {
  if (expected.length !== actual.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (!authorizationIsCurrent()) return false;
    const [expectedKey, expectedBlob] = expected[index];
    const [actualKey, actualBlob] = actual[index];
    if (
      expectedKey !== actualKey ||
      expectedBlob.size !== actualBlob.size ||
      expectedBlob.type !== actualBlob.type
    ) {
      return false;
    }
    const [expectedBytes, actualBytes] = await Promise.all([
      expectedBlob.arrayBuffer(),
      actualBlob.arrayBuffer(),
    ]);
    if (!authorizationIsCurrent()) return false;
    const left = new Uint8Array(expectedBytes);
    const right = new Uint8Array(actualBytes);
    if (left.some((value, offset) => value !== right[offset])) return false;
  }
  return authorizationIsCurrent();
}

/** Copies and validates the avatar database before legacy deletion begins. */
async function stageAvatarDatabase(
  authorizationIsCurrent: () => boolean,
): Promise<boolean> {
  if (typeof indexedDB === "undefined" || !authorizationIsCurrent()) {
    return false;
  }
  const legacy = await openAvatarDatabase(LEGACY_AVATAR_DATABASE_NAME);
  if (!legacy) return false;
  const entries = await readAvatarEntries(legacy);
  legacy.close();
  if (!entries || !authorizationIsCurrent()) return false;
  const v2 = await openAvatarDatabase(WEB_V2_AVATAR_DATABASE_NAME);
  if (!v2) return false;
  const replaced = await replaceAvatarEntries(
    v2,
    entries,
    authorizationIsCurrent,
  );
  const staged = replaced ? await readAvatarEntries(v2) : null;
  v2.close();
  return Boolean(
    staged &&
      authorizationIsCurrent() &&
      (await avatarEntriesMatch(entries, staged, authorizationIsCurrent)),
  );
}

/** Deletes one avatar database and treats a blocked old client as unavailable. */
function deleteAvatarDatabase(
  name: string,
  authorizationIsCurrent: () => boolean,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!authorizationIsCurrent()) return resolve(false);
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve(authorizationIsCurrent());
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Proves a deleted database was not recreated by an older live document. */
async function avatarDatabaseIsAbsent(
  name: string,
  authorizationIsCurrent: () => boolean,
): Promise<boolean> {
  if (
    typeof indexedDB === "undefined" ||
    typeof indexedDB.databases !== "function" ||
    !authorizationIsCurrent()
  ) {
    return false;
  }
  try {
    const databases = await indexedDB.databases();
    return (
      authorizationIsCurrent() &&
      databases.length <= 128 &&
      !databases.some((database) => database.name === name)
    );
  } catch {
    return false;
  }
}

/** Resolves every bounded private localStorage key across both namespaces. */
function allPrivateLocalStorageKeys(
  storage: CutoverStorage,
): string[] | null {
  const legacyJournalKeys = keysWithPrefix(
    storage,
    LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
  );
  const v2JournalKeys = keysWithPrefix(
    storage,
    WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
  );
  if (!legacyJournalKeys || !v2JournalKeys) return null;
  return [
    ...WEB_PRIVATE_FIXED_STORAGE_KEY_PAIRS.flatMap(([legacyKey, v2Key]) => [
      legacyKey,
      v2Key,
    ]),
    ...WEB_PRIVATE_LEGACY_REMOVAL_ONLY_KEYS,
    ...WEB_PRIVATE_V2_REMOVAL_ONLY_KEYS,
    ...legacyJournalKeys,
    ...v2JournalKeys,
  ];
}

/** Proves no private localStorage byte exists outside an optional provenance. */
function privateLocalStorageIsEmpty(
  storage: CutoverStorage,
  authorizationIsCurrent: () => boolean,
  allowedKey: string | null = null,
): boolean {
  const keys = allPrivateLocalStorageKeys(storage);
  if (!keys) return false;
  for (const key of new Set(keys)) {
    if (!authorizationIsCurrent()) return false;
    const value = storage.getItem(key);
    if (key === allowedKey) {
      if (value !== WEB_PRIVATE_NEVER_OWNED_VALUE) return false;
    } else if (value !== null) {
      return false;
    }
  }
  return authorizationIsCurrent();
}

/** Proves both avatar namespaces empty, then removes the empty databases. */
async function proveAvatarDatabasesEmpty(
  authorizationIsCurrent: () => boolean,
): Promise<boolean> {
  if (typeof indexedDB === "undefined" || !authorizationIsCurrent()) {
    return false;
  }
  for (const name of [
    LEGACY_AVATAR_DATABASE_NAME,
    WEB_V2_AVATAR_DATABASE_NAME,
  ]) {
    const database = await openAvatarDatabase(name);
    if (!database) return false;
    const entries = await readAvatarEntries(database);
    database.close();
    if (!entries || entries.length !== 0 || !authorizationIsCurrent()) {
      return false;
    }
    if (!(await deleteAvatarDatabase(name, authorizationIsCurrent))) {
      return false;
    }
  }
  return authorizationIsCurrent();
}

export type LegacyWebPrivateGuestRecoveryDisposition =
  | "ambiguous"
  | "empty-unproven"
  | "unavailable";

/** Classifies bounded localStorage without treating unexplained v2 bytes as guest. */
function classifyLegacyGuestLocalStorage(
  storage: CutoverStorage,
  authorizationIsCurrent: () => boolean,
): LegacyWebPrivateGuestRecoveryDisposition {
  if (
    !authorizationIsCurrent() ||
    readLegacyWebPrivateCutoverState(storage) !== "none" ||
    readWebPrivateNamespaceState(storage) !== "legacy"
  ) {
    return "unavailable";
  }
  const legacyJournalKeys = keysWithPrefix(
    storage,
    LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
  );
  const v2JournalKeys = keysWithPrefix(
    storage,
    WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
  );
  if (!legacyJournalKeys || !v2JournalKeys) return "unavailable";

  let legacyBytesPresent = false;
  let totalCharacters = 0;
  const inspect = (key: string, namespace: "legacy" | "v2") => {
    if (!authorizationIsCurrent()) return false;
    const value = storage.getItem(key);
    if (value === null) return true;
    if (value.length > MAX_PRIVATE_VALUE_CHARACTERS) return false;
    totalCharacters += value.length;
    if (totalCharacters > MAX_PRIVATE_TOTAL_CHARACTERS) return false;
    if (namespace === "v2") return false;
    legacyBytesPresent = true;
    return true;
  };
  for (const [legacyKey, v2Key] of WEB_PRIVATE_FIXED_STORAGE_KEY_PAIRS) {
    if (!inspect(v2Key, "v2") || !inspect(legacyKey, "legacy")) {
      return "unavailable";
    }
  }
  for (const key of WEB_PRIVATE_V2_REMOVAL_ONLY_KEYS) {
    if (!inspect(key, "v2")) return "unavailable";
  }
  for (const key of WEB_PRIVATE_LEGACY_REMOVAL_ONLY_KEYS) {
    if (!inspect(key, "legacy")) return "unavailable";
  }
  for (const key of v2JournalKeys) {
    if (!inspect(key, "v2")) return "unavailable";
  }
  for (const key of legacyJournalKeys) {
    const value = storage.getItem(key);
    if (
      !authorizationIsCurrent() ||
      value === null ||
      value.length > MAX_JOURNAL_VALUE_CHARACTERS
    ) {
      return "unavailable";
    }
    totalCharacters += value.length;
    if (totalCharacters > MAX_PRIVATE_TOTAL_CHARACTERS) {
      return "unavailable";
    }
    legacyBytesPresent = true;
  }
  return authorizationIsCurrent()
    ? legacyBytesPresent
      ? "ambiguous"
      : "empty-unproven"
    : "unavailable";
}

/** Opens only a database proved to exist, aborting any surprise creation. */
function openExistingAvatarDatabase(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      let created = false;
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => {
        created = true;
        request.transaction?.abort();
      };
      request.onsuccess = () => {
        if (created) {
          request.result.close();
          resolve(null);
          return;
        }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Distinguishes bounded legacy avatar bytes from unexplained v2 media. */
async function classifyLegacyGuestAvatarDatabases(
  authorizationIsCurrent: () => boolean,
): Promise<LegacyWebPrivateGuestRecoveryDisposition> {
  if (
    typeof indexedDB === "undefined" ||
    typeof indexedDB.databases !== "function" ||
    !authorizationIsCurrent()
  ) {
    return "unavailable";
  }
  try {
    const databases = await indexedDB.databases();
    if (!authorizationIsCurrent() || databases.length > 128) {
      return "unavailable";
    }
    const names = new Set(
      databases.map((database) => database.name).filter(Boolean),
    );
    let legacyBytesPresent = false;
    for (const [name, namespace] of [
      [LEGACY_AVATAR_DATABASE_NAME, "legacy"],
      [WEB_V2_AVATAR_DATABASE_NAME, "v2"],
    ] as const) {
      if (!names.has(name)) continue;
      const database = await openExistingAvatarDatabase(name);
      if (!database) return "unavailable";
      const entries = await readAvatarEntries(database);
      database.close();
      if (!entries || !authorizationIsCurrent()) return "unavailable";
      if (entries.length === 0) continue;
      if (namespace === "v2") return "unavailable";
      legacyBytesPresent = true;
    }
    return authorizationIsCurrent()
      ? legacyBytesPresent
        ? "ambiguous"
        : "empty-unproven"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Proves both avatar databases are absent or contain no private entries. */
async function avatarDatabasesAreEmpty(
  authorizationIsCurrent: () => boolean,
): Promise<boolean> {
  if (
    typeof indexedDB === "undefined" ||
    typeof indexedDB.databases !== "function" ||
    !authorizationIsCurrent()
  ) {
    return false;
  }
  try {
    const databases = await indexedDB.databases();
    if (!authorizationIsCurrent() || databases.length > 128) return false;
    const names = new Set(
      databases.map((database) => database.name).filter(Boolean),
    );
    for (const name of [
      LEGACY_AVATAR_DATABASE_NAME,
      WEB_V2_AVATAR_DATABASE_NAME,
    ]) {
      if (!names.has(name)) continue;
      const database = await openExistingAvatarDatabase(name);
      if (!database) return false;
      const entries = await readAvatarEntries(database);
      database.close();
      if (!entries || entries.length !== 0 || !authorizationIsCurrent()) {
        return false;
      }
    }
    return authorizationIsCurrent();
  } catch {
    return false;
  }
}

/** Combines content-free localStorage and avatar recovery classification. */
async function classifyLegacyGuestPrivateData(
  storage: CutoverStorage,
  authorizationIsCurrent: () => boolean,
): Promise<LegacyWebPrivateGuestRecoveryDisposition> {
  const local = classifyLegacyGuestLocalStorage(
    storage,
    authorizationIsCurrent,
  );
  if (local === "unavailable") return "unavailable";
  const avatar = await classifyLegacyGuestAvatarDatabases(
    authorizationIsCurrent,
  );
  if (avatar === "unavailable") return "unavailable";
  return local === "ambiguous" || avatar === "ambiguous"
    ? "ambiguous"
    : "empty-unproven";
}

/** Removes every bounded private localStorage byte with exact readback. */
function removeAllPrivateLocalStorage(
  storage: CutoverStorage,
  authorizationIsCurrent: () => boolean,
): boolean {
  const keys = allPrivateLocalStorageKeys(storage);
  if (!keys) return false;
  for (const key of new Set(keys)) {
    if (!authorizationIsCurrent()) return false;
    storage.removeItem(key);
    if (!authorizationIsCurrent() || storage.getItem(key) !== null) {
      return false;
    }
  }
  return authorizationIsCurrent();
}

/**
 * Stages every web-private value, removes every ed28-readable source, and
 * commits the namespace marker last without mutating auth or provider state.
 */
export async function cutoverLegacyWebPrivateDataToV2(
  expectedUserId: string,
  webOperation: WebAccountOperationHandle,
): Promise<LegacyWebPrivateCutoverResult> {
  const storage = browserStorage();
  if (!storage || !expectedUserId) return "unavailable";
  try {
    return await withWebAuthStorageLock(async () => {
      const allowed = () =>
        webPrivateInstallCutoverAllowed(webOperation, expectedUserId);
      if (!allowed()) return "unavailable";
      const marker = storage.getItem(WEB_PRIVATE_NAMESPACE_V2_MARKER);
      if (marker === WEB_PRIVATE_NAMESPACE_V2_COMPLETE) {
        if (
          currentSourceOwnerDisposition(storage, expectedUserId) ===
            "unavailable" ||
          !removeLegacyLocalStorage(storage, allowed) ||
          !(await deleteAvatarDatabase(
            LEGACY_AVATAR_DATABASE_NAME,
            allowed,
          )) ||
          !allowed()
        ) {
          return "unavailable";
        }
        return "already-committed";
      }
      if (marker !== null) return "unavailable";

      let phase = storage.getItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY);
      if (
        phase !== null &&
        phase !== WEB_PRIVATE_CUTOVER_STAGING &&
        phase !== WEB_PRIVATE_CUTOVER_PREPARED
      ) {
        return "unavailable";
      }
      if (phase === null) {
        if (
          currentSourceOwnerDisposition(storage, expectedUserId) ===
          "unavailable"
        ) {
          return "unavailable";
        }
        storage.setItem(
          WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
          WEB_PRIVATE_CUTOVER_STAGING,
        );
        if (
          storage.getItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY) !==
          WEB_PRIVATE_CUTOVER_STAGING
        ) {
          return "unavailable";
        }
        phase = WEB_PRIVATE_CUTOVER_STAGING;
      }
      if (phase === WEB_PRIVATE_CUTOVER_STAGING) {
        if (
          currentSourceOwnerDisposition(storage, expectedUserId) ===
          "unavailable"
        ) {
          return "unavailable";
        }
        const stagedCharacters = stageFixedLocalStorage(storage, allowed);
        if (
          stagedCharacters === null ||
          !stageJournalLocalStorage(storage, stagedCharacters, allowed) ||
          !allowed() ||
          !(await stageAvatarDatabase(allowed))
        ) {
          return "unavailable";
        }
        storage.setItem(
          WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
          WEB_PRIVATE_CUTOVER_PREPARED,
        );
        if (
          storage.getItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY) !==
          WEB_PRIVATE_CUTOVER_PREPARED
        ) {
          return "unavailable";
        }
      } else if (
        currentSourceOwnerDisposition(storage, expectedUserId) ===
        "unavailable"
      ) {
        return "unavailable";
      }

      if (!removeLegacyLocalStorage(storage, allowed)) return "unavailable";
      if (!(await deleteAvatarDatabase(LEGACY_AVATAR_DATABASE_NAME, allowed))) {
        return "unavailable";
      }
      if (!allowed()) return "unavailable";
      storage.setItem(
        WEB_PRIVATE_NAMESPACE_V2_MARKER,
        WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
      );
      return storage.getItem(WEB_PRIVATE_NAMESPACE_V2_MARKER) ===
        WEB_PRIVATE_NAMESPACE_V2_COMPLETE
        ? "committed"
        : "unavailable";
    });
  } catch {
    return "unavailable";
  }
}

/**
 * Reasserts the ed28 rollback namespace is empty before any committed-v2
 * active session may acquire a private read lease.
 */
export async function removeAndProveLegacyWebPrivateResidue(
  webOperation: WebAccountOperationHandle,
  expectedUserId: string,
): Promise<boolean> {
  const storage = browserStorage();
  if (!storage || !validSourceUserId(expectedUserId)) return false;
  try {
    return await withWebAuthStorageLock(async () => {
      const allowed = () =>
        webPrivateLegacyAbsenceAuditAllowed(
          webOperation,
          expectedUserId,
        );
      if (
        !allowed() ||
        readWebPrivateNamespaceState(storage) !== "v2" ||
        !removeLegacyLocalStorage(storage, allowed) ||
        !(await deleteAvatarDatabase(
          LEGACY_AVATAR_DATABASE_NAME,
          allowed,
        )) ||
        !removeLegacyLocalStorage(storage, allowed) ||
        !(await avatarDatabaseIsAbsent(
          LEGACY_AVATAR_DATABASE_NAME,
          allowed,
        ))
      ) {
        return false;
      }
      return allowed();
    });
  } catch {
    return false;
  }
}

/** Proves terminal cleanup has left no private byte in either namespace. */
export async function proveAllWebPrivateDataNamespacesEmpty(): Promise<boolean> {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    return await withWebAuthStorageLock(async () => {
      const allowed = () => terminalWebPrivateWriteRemovalAllowed();
      const localStorageIsEmpty = () => {
        if (!allowed() || !privateLocalStorageIsEmpty(storage, allowed)) {
          return false;
        }
        for (const key of [
          WEB_PRIVATE_NAMESPACE_V2_MARKER,
          WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
          WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY,
        ]) {
          if (!allowed() || storage.getItem(key) !== null) return false;
        }
        return allowed();
      };
      return (
        localStorageIsEmpty() &&
        (await avatarDatabasesAreEmpty(allowed)) &&
        localStorageIsEmpty()
      );
    });
  } catch {
    return false;
  }
}

/** Returns only the staged owner category while exact installing authority holds. */
export async function readWebPrivateSourceOwnerDisposition(
  expectedUserId: string,
  webOperation: WebAccountOperationHandle,
): Promise<WebPrivateSourceOwnerDisposition> {
  const storage = browserStorage();
  if (!storage || !validSourceUserId(expectedUserId)) return "unavailable";
  try {
    return await withWebAuthStorageLock(async () =>
      webPrivateInstallCutoverAllowed(webOperation, expectedUserId)
        ? currentSourceOwnerDisposition(storage, expectedUserId)
        : "unavailable",
    );
  } catch {
    return "unavailable";
  }
}

/**
 * Establishes durable guest provenance only after both namespaces and avatar
 * databases are proved empty under the narrow fresh-realm authority.
 */
export async function establishNeverOwnedWebPrivateGuestProvenance(): Promise<boolean> {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    return await withWebAuthStorageLock(async () => {
      const allowed = () =>
        webPrivateNeverOwnedGuestProvenanceAllowed();
      if (
        !allowed() ||
        readLegacyWebPrivateCutoverState(storage) !== "none" ||
        readWebPrivateNamespaceState(storage) !== "legacy" ||
        !privateLocalStorageIsEmpty(storage, allowed) ||
        !(await proveAvatarDatabasesEmpty(allowed)) ||
        !privateLocalStorageIsEmpty(storage, allowed) ||
        !allowed()
      ) {
        return false;
      }
      storage.setItem(
        LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
        WEB_PRIVATE_NEVER_OWNED_VALUE,
      );
      return (
        allowed() &&
        privateLocalStorageIsEmpty(
          storage,
          allowed,
          LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
        )
      );
    });
  } catch {
    return false;
  }
}

/** Classifies missing-auth legacy bytes only inside the reviewed inspection. */
export async function classifyLegacyWebPrivateGuestRecovery(): Promise<LegacyWebPrivateGuestRecoveryDisposition> {
  const storage = browserStorage();
  if (!storage) return "unavailable";
  try {
    return await withWebAuthStorageLock(async () => {
      const allowed = () =>
        webPrivateLegacyGuestRecoveryAllowed("inspect");
      return allowed()
        ? classifyLegacyGuestPrivateData(storage, allowed)
        : "unavailable";
    });
  } catch {
    return "unavailable";
  }
}

/** Adopts ambiguous legacy bytes only after an explicit keep decision. */
export async function adoptAmbiguousLegacyWebPrivateDataAsGuest(): Promise<boolean> {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    return await withWebAuthStorageLock(async () => {
      const allowed = () =>
        webPrivateLegacyGuestRecoveryAllowed("explicit-keep");
      if (
        !allowed() ||
        (await classifyLegacyGuestPrivateData(storage, allowed)) !==
          "ambiguous" ||
        !allowed()
      ) {
        return false;
      }
      storage.setItem(
        LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
        WEB_PRIVATE_NEVER_OWNED_VALUE,
      );
      return (
        allowed() &&
        storage.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY) ===
          WEB_PRIVATE_NEVER_OWNED_VALUE
      );
    });
  } catch {
    return false;
  }
}

/** Resumes an explicit clear and publishes durable empty guest proof last. */
export async function purgeAmbiguousWebPrivateDataAndEstablishGuest(): Promise<boolean> {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    return await withWebAuthStorageLock(async () => {
      const allowed = () =>
        webPrivateLegacyGuestRecoveryAllowed("explicit-clear");
      if (!allowed()) return false;
      const clearState = readWebPrivateGuestClearState(storage);
      if (clearState === "unavailable") return false;
      if (clearState === "none") {
        storage.setItem(
          WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY,
          WEB_PRIVATE_GUEST_CLEAR_IN_PROGRESS,
        );
      }
      if (
        !allowed() ||
        readWebPrivateGuestClearState(storage) !== "clearing"
      ) {
        return false;
      }
      storage.removeItem(WEB_PRIVATE_NAMESPACE_V2_MARKER);
      if (
        !allowed() ||
        storage.getItem(WEB_PRIVATE_NAMESPACE_V2_MARKER) !== null ||
        !removeAllPrivateLocalStorage(storage, allowed) ||
        !(await deleteAvatarDatabase(
          LEGACY_AVATAR_DATABASE_NAME,
          allowed,
        )) ||
        !(await deleteAvatarDatabase(
          WEB_V2_AVATAR_DATABASE_NAME,
          allowed,
        )) ||
        !(await avatarDatabaseIsAbsent(
          LEGACY_AVATAR_DATABASE_NAME,
          allowed,
        )) ||
        !(await avatarDatabaseIsAbsent(
          WEB_V2_AVATAR_DATABASE_NAME,
          allowed,
        )) ||
        !removeAllPrivateLocalStorage(storage, allowed) ||
        !privateLocalStorageIsEmpty(storage, allowed)
      ) {
        return false;
      }
      storage.removeItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY);
      if (
        !allowed() ||
        storage.getItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY) !== null
      ) {
        return false;
      }
      storage.setItem(
        LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
        WEB_PRIVATE_NEVER_OWNED_VALUE,
      );
      if (
        !allowed() ||
        !privateLocalStorageIsEmpty(
          storage,
          allowed,
          LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
        )
      ) {
        return false;
      }
      storage.removeItem(WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY);
      return (
        allowed() &&
        readWebPrivateGuestClearState(storage) === "none" &&
        readLegacyWebPrivateCutoverState(storage) === "none" &&
        privateLocalStorageIsEmpty(
          storage,
          allowed,
          LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
        )
      );
    });
  } catch {
    return false;
  }
}

/**
 * Explicitly discards an installing realm's old private namespaces and then
 * publishes a fresh exact-owner contract without rendering either source.
 */
export async function purgeAndCommitFreshWebPrivateInstall(
  webOperation: WebAccountOperationHandle,
  expectedUserId: string,
): Promise<boolean> {
  const storage = browserStorage();
  if (!storage || !validSourceUserId(expectedUserId)) return false;
  try {
    return await withWebAuthStorageLock(async () => {
      const allowed = () =>
        webPrivateFreshInstallResetAllowed(
          webOperation,
          expectedUserId,
        );
      if (!allowed()) return false;

      // Staging predates every destructive mutation so a crash cannot reopen
      // either namespace as a guest journey.
      storage.setItem(
        WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
        WEB_PRIVATE_CUTOVER_STAGING,
      );
      if (
        !allowed() ||
        storage.getItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY) !==
          WEB_PRIVATE_CUTOVER_STAGING
      ) {
        return false;
      }
      storage.removeItem(WEB_PRIVATE_NAMESPACE_V2_MARKER);
      if (
        !allowed() ||
        storage.getItem(WEB_PRIVATE_NAMESPACE_V2_MARKER) !== null ||
        !removeAllPrivateLocalStorage(storage, allowed) ||
        !(await deleteAvatarDatabase(
          LEGACY_AVATAR_DATABASE_NAME,
          allowed,
        )) ||
        !(await deleteAvatarDatabase(
          WEB_V2_AVATAR_DATABASE_NAME,
          allowed,
        )) ||
        !privateLocalStorageIsEmpty(storage, allowed)
      ) {
        return false;
      }

      storage.setItem(
        WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
        WEB_PRIVATE_CUTOVER_PREPARED,
      );
      if (
        !allowed() ||
        storage.getItem(WEB_PRIVATE_CUTOVER_JOURNAL_KEY) !==
          WEB_PRIVATE_CUTOVER_PREPARED
      ) {
        return false;
      }
      storage.setItem(
        WEB_PRIVATE_NAMESPACE_V2_MARKER,
        WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
      );
      if (
        !allowed() ||
        readWebPrivateNamespaceState(storage) !== "v2"
      ) {
        return false;
      }
      return writeHandoffOwnerContract(
        storage,
        expectedUserId,
        false,
        allowed,
      );
    });
  } catch {
    return false;
  }
}

export type WebPrivateHandoffCommitState =
  | "fresh"
  | "keep"
  | "unavailable";

/** Proves the complete owner contract without treating owner alone as ready. */
function readHandoffCommitState(
  storage: CutoverStorage,
  expectedUserId: string,
): WebPrivateHandoffCommitState {
  try {
    if (
      !validSourceUserId(expectedUserId) ||
      readWebPrivateNamespaceState(storage) !== "v2" ||
      storage.getItem(WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY) !==
        WEB_PRIVATE_HANDOFF_CONTRACT_COMPLETE ||
      storage.getItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY) !== expectedUserId ||
      storage.getItem(WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY) !==
        expectedUserId ||
      storage.getItem(WEB_V2_GUEST_PROVENANCE_STORAGE_KEY) !== null
    ) {
      return "unavailable";
    }
    const claim = storage.getItem(WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY);
    if (claim === expectedUserId) return "keep";
    return claim === null ? "fresh" : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Publishes pending/claim metadata before owner and a content-free readiness
 * marker, so a crash after any individual mutation stays closed and retryable.
 */
function writeHandoffOwnerContract(
  storage: CutoverStorage,
  expectedUserId: string,
  keepLocalJourney: boolean,
  authorizationIsCurrent: () => boolean,
): boolean {
  const expectedState = keepLocalJourney ? "keep" : "fresh";
  if (
    authorizationIsCurrent() &&
    readHandoffCommitState(storage, expectedUserId) === expectedState
  ) {
    return true;
  }
  try {
    if (!authorizationIsCurrent()) return false;
    storage.removeItem(WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY);
    if (
      !authorizationIsCurrent() ||
      storage.getItem(WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY) !== null
    ) {
      return false;
    }

    storage.setItem(
      WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY,
      expectedUserId,
    );
    if (
      !authorizationIsCurrent() ||
      storage.getItem(WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY) !==
        expectedUserId
    ) {
      return false;
    }

    if (keepLocalJourney) {
      storage.setItem(
        WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY,
        expectedUserId,
      );
    } else {
      storage.removeItem(WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY);
    }
    if (
      !authorizationIsCurrent() ||
      storage.getItem(WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY) !==
        (keepLocalJourney ? expectedUserId : null)
    ) {
      return false;
    }

    storage.removeItem(WEB_V2_GUEST_PROVENANCE_STORAGE_KEY);
    if (
      !authorizationIsCurrent() ||
      storage.getItem(WEB_V2_GUEST_PROVENANCE_STORAGE_KEY) !== null
    ) {
      return false;
    }

    // Owner is the final identity-bearing mutation; readiness is still absent.
    storage.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, expectedUserId);
    if (
      !authorizationIsCurrent() ||
      storage.getItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY) !== expectedUserId
    ) {
      return false;
    }

    storage.setItem(
      WEB_V2_HANDOFF_CONTRACT_STORAGE_KEY,
      WEB_PRIVATE_HANDOFF_CONTRACT_COMPLETE,
    );
    return (
      authorizationIsCurrent() &&
      readHandoffCommitState(storage, expectedUserId) === expectedState
    );
  } catch {
    return false;
  }
}

/**
 * Publishes the installed owner contract in an installing, reset, or ordinary
 * active generation without ever granting general writes to a reset scope.
 */
export async function commitWebPrivateHandoffOwner(
  webOperation: WebAccountOperationHandle,
  expectedUserId: string,
  keepLocalJourney: boolean,
): Promise<boolean> {
  const storage = browserStorage();
  if (!storage || !validSourceUserId(expectedUserId)) return false;
  try {
    return await withWebAuthStorageLock(async () => {
      const installingCommit = webPrivateInstallCutoverAllowed(
        webOperation,
        expectedUserId,
      );
      const resetCommit = webPrivateActiveResetCommitAllowed(
        webOperation,
        expectedUserId,
      );
      const guard = installingCommit || resetCommit
        ? null
        : beginWebPrivateWrite();
      const allowed = () =>
        installingCommit
          ? webPrivateInstallCutoverAllowed(webOperation, expectedUserId)
          : resetCommit
            ? webPrivateActiveResetCommitAllowed(
                webOperation,
                expectedUserId,
              )
            : Boolean(guard && webPrivateWriteGuardIsCurrent(guard));
      return (
        allowed() &&
        readWebPrivateNamespaceState(storage) === "v2" &&
        writeHandoffOwnerContract(
          storage,
          expectedUserId,
          keepLocalJourney,
          allowed,
        )
      );
    });
  } catch {
    return false;
  }
}

/** Reads the exact installed-owner contract only under live install authority. */
export async function readWebPrivateHandoffCommitState(
  webOperation: WebAccountOperationHandle,
  expectedUserId: string,
): Promise<WebPrivateHandoffCommitState> {
  const storage = browserStorage();
  if (!storage || !validSourceUserId(expectedUserId)) return "unavailable";
  try {
    return await withWebAuthStorageLock(async () =>
      webPrivateInstallCutoverAllowed(webOperation, expectedUserId)
        ? readHandoffCommitState(storage, expectedUserId)
        : "unavailable",
    );
  } catch {
    return "unavailable";
  }
}

/** Removes all private values while leaving auth and owner markers untouched. */
export async function purgeAllWebPrivateDataNamespaces(): Promise<boolean> {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    return await withWebAuthStorageLock(async () => {
      const allowed = () => reviewedWebPrivateWriteRemovalAllowed();
      if (!allowed()) return false;
      const ownerKeys = new Set([
        LEGACY_LAST_SYNC_USER_STORAGE_KEY,
        WEB_V2_LAST_SYNC_USER_STORAGE_KEY,
        LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY,
        WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY,
        LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY,
        WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY,
      ]);
      const legacyJournalKeys = keysWithPrefix(
        storage,
        LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
      );
      const v2JournalKeys = keysWithPrefix(
        storage,
        WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
      );
      if (!legacyJournalKeys || !v2JournalKeys) return false;
      const keys = [
        ...WEB_PRIVATE_FIXED_STORAGE_KEY_PAIRS.flatMap(([legacyKey, v2Key]) =>
          ownerKeys.has(legacyKey) ? [] : [legacyKey, v2Key],
        ),
        ...WEB_PRIVATE_LEGACY_REMOVAL_ONLY_KEYS,
        ...WEB_PRIVATE_V2_REMOVAL_ONLY_KEYS,
        WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
        WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY,
        ...legacyJournalKeys,
        ...v2JournalKeys,
      ];
      for (const key of new Set(keys)) {
        if (!allowed()) return false;
        storage.removeItem(key);
        if (storage.getItem(key) !== null) return false;
      }
      if (
        !(await deleteAvatarDatabase(
          LEGACY_AVATAR_DATABASE_NAME,
          allowed,
        )) ||
        !(await deleteAvatarDatabase(
          WEB_V2_AVATAR_DATABASE_NAME,
          allowed,
        )) ||
        !allowed()
      ) {
        return false;
      }
      // Namespace visibility changes only after every private byte is absent.
      storage.removeItem(WEB_PRIVATE_NAMESPACE_V2_MARKER);
      return (
        allowed() &&
        storage.getItem(WEB_PRIVATE_NAMESPACE_V2_MARKER) === null
      );
    });
  } catch {
    return false;
  }
}
