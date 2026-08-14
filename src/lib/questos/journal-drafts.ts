"use client";

/**
 * Device-local recovery for unfinished prayer-journal writing.
 *
 * Drafts never enter QuestOS snapshots, sync, analytics, or URLs. They are
 * deliberately scoped by entry kind/id and expire after a bounded period so
 * abandoned sensitive text is not retained forever on a shared browser.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  removeWebPrivateStorageItem,
  webPrivateStorageReadAllowed,
  withWebPrivateRemovalGuard,
  withWebPrivateWriteGuard,
} from "@/lib/storage/web-private-write";
import {
  LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
  LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
  WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
  WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
  selectedWebPrivateStorageKey,
} from "@/lib/storage/web-private-namespace";

export type JournalDraftKind = "prayer" | "reflection";
export type JournalDraftField = string | number | boolean | null | undefined;
export type JournalDraftFields = Record<string, JournalDraftField>;

export interface DeviceLocalJournalDraft<T extends JournalDraftFields> {
  version: 2;
  kind: JournalDraftKind;
  entryId: string | null;
  fields: T;
  updatedAt: string;
  /** Drafts written before the latest destructive reset are never restored. */
  clearEpoch: string | null;
}

export interface UseDeviceLocalJournalDraftOptions<
  T extends JournalDraftFields,
> {
  kind: JournalDraftKind;
  entryId?: string;
  initialValue: T;
  enabled?: boolean;
  debounceMs?: number;
  /** Override for tests or non-window hosts; null explicitly disables storage. */
  storage?: Storage | null;
  /** Define meaningful content (normally `draft.body.trim().length > 0`). */
  isEmpty?: (draft: T) => boolean;
  /** Safe blank state to show after a destructive reset in this or another tab. */
  clearedValue?: T;
}

export interface UseDeviceLocalJournalDraftResult<
  T extends JournalDraftFields,
> {
  value: T;
  setValue: Dispatch<SetStateAction<T>>;
  restored: boolean;
  savedAt: string | null;
  /** Flush immediately before an SPA navigation, where `pagehide` will not fire. */
  saveDraft: () => void;
  clearDraft: () => void;
}

export const JOURNAL_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const STORAGE_PREFIX = LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX;
const DRAFTS_CLEARED_EVENT = "biblequest:journal-drafts-cleared";
const MAX_DRAFT_KEYS = 64;
const MAX_DRAFT_KEY_CHARACTERS = 512;

function normalizedEntryId(entryId?: string): string | null {
  return entryId?.trim() || null;
}

export function journalDraftStorageKey(
  kind: JournalDraftKind,
  entryId?: string,
): string {
  const scope = normalizedEntryId(entryId) ?? "new";
  return `${STORAGE_PREFIX}:${kind}:${encodeURIComponent(scope)}`;
}

function resolveStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Selects the journal prefix only after an exact namespace decision. */
function selectedDraftPrefix(storage: Storage): string | null {
  return selectedWebPrivateStorageKey(
    storage,
    LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
    WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
  );
}

/** Selects the matching destructive epoch key in the same namespace. */
function selectedDraftEpochKey(storage: Storage): string | null {
  return selectedWebPrivateStorageKey(
    storage,
    LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
    WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
  );
}

/** Builds one selected draft key without exposing interrupted cutover bytes. */
function selectedJournalDraftStorageKey(
  storage: Storage,
  kind: JournalDraftKind,
  entryId?: string,
): string | null {
  const prefix = selectedDraftPrefix(storage);
  if (!prefix) return null;
  const scope = normalizedEntryId(entryId) ?? "new";
  return `${prefix}:${kind}:${encodeURIComponent(scope)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDraftFields(value: unknown): value is JournalDraftFields {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (field) =>
      field === null ||
      field === undefined ||
      typeof field === "string" ||
      typeof field === "boolean" ||
      (typeof field === "number" && Number.isFinite(field)),
  );
}

function removeQuietly(
  storage: Storage,
  key: string,
  testFixtureStorage: boolean,
  expectedValue?: string | null,
): Promise<boolean> {
  return removeWebPrivateStorageItem(
    storage,
    key,
    testFixtureStorage,
    expectedValue,
  );
}

/** Enumerates bounded draft keys only while the supplied authority survives. */
function enumerateJournalDraftKeys(
  storage: Storage,
  prefix: string,
  authorizationIsCurrent: () => boolean,
): string[] | null {
  try {
    if (!authorizationIsCurrent() || storage.length > 512) return null;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      if (!authorizationIsCurrent()) return null;
      const key = storage.key(index);
      if (!key?.startsWith(`${prefix}:`)) continue;
      if (
        key.length > MAX_DRAFT_KEY_CHARACTERS ||
        keys.length >= MAX_DRAFT_KEYS
      ) {
        return null;
      }
      keys.push(key);
    }
    return authorizationIsCurrent() ? keys : null;
  } catch {
    return null;
  }
}

/** Enumerates selected draft keys only under the exact private read lease. */
function journalDraftKeys(
  storage: Storage,
  prefix = selectedDraftPrefix(storage),
  testFixtureStorage = false,
): string[] | null {
  if (!prefix) return null;
  return enumerateJournalDraftKeys(
    storage,
    prefix,
    () => webPrivateStorageReadAllowed(storage, testFixtureStorage),
  );
}

/** Reads the selected destructive epoch with pre/post authority checks. */
function readDraftClearEpoch(
  storage: Storage,
  testFixtureStorage = false,
): string | null {
  try {
    if (!webPrivateStorageReadAllowed(storage, testFixtureStorage)) {
      return null;
    }
    const key = selectedDraftEpochKey(storage);
    const epoch = key ? storage.getItem(key) : null;
    return webPrivateStorageReadAllowed(storage, testFixtureStorage)
      ? epoch
      : null;
  } catch {
    return null;
  }
}

function nextDraftClearEpoch(): string {
  // Updating a non-sensitive epoch key creates a native `storage` event in
  // every other tab. A unique suffix ensures two fast resets still notify.
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${new Date().toISOString()}:${unique}`;
}

function removeAllJournalDraftKeys(
  storage: Storage,
  prefix: string,
  testFixtureStorage: boolean,
): number {
  let removed = 0;
  const keys = journalDraftKeys(storage, prefix, testFixtureStorage);
  if (!keys) return -1;
  for (const key of keys) {
    storage.removeItem(key);
    if (storage.getItem(key) === null) removed += 1;
  }
  return removed;
}

function notifyDraftHooksAfterClear(storage: Storage | null | undefined) {
  if (storage !== undefined || typeof window === "undefined") return;
  if (typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(DRAFTS_CLEARED_EVENT));
  }
}

/**
 * Remove every unfinished journal draft without touching unrelated browser
 * storage. Destructive data controls and account hand-offs must call this so
 * private text cannot survive after the journey itself has been removed.
 */
export async function clearAllDeviceLocalJournalDrafts(
  storage?: Storage | null,
): Promise<number> {
  const target = resolveStorage(storage);
  if (!target) return -1;
  const testFixtureStorage = storage !== undefined;
  const result = await withWebPrivateWriteGuard(() => {
    const prefix = selectedDraftPrefix(target);
    const epochKey = selectedDraftEpochKey(target);
    const draftKeys = journalDraftKeys(
      target,
      prefix,
      testFixtureStorage,
    );
    if (!prefix || !epochKey || !draftKeys) return { value: -1 };
    const previousEpoch = target.getItem(epochKey);
    const previousDrafts = new Map(
      draftKeys.map((key) => [key, target.getItem(key)]),
    );
    const nextEpoch = nextDraftClearEpoch();
    let epochAdvanced = false;
    try {
      target.setItem(epochKey, nextEpoch);
      epochAdvanced = target.getItem(epochKey) === nextEpoch;
    } catch {
      epochAdvanced = target.getItem(epochKey) === nextEpoch;
    }
    let removed = removeAllJournalDraftKeys(
      target,
      prefix,
      testFixtureStorage,
    );
    if (removed < 0) throw new Error("draft enumeration failed");
    if (!epochAdvanced) {
      // Clearing drafts may free quota for the cross-tab epoch sentinel.
      target.setItem(epochKey, nextEpoch);
      if (target.getItem(epochKey) !== nextEpoch) {
        throw new Error("draft clear epoch failed");
      }
      const finalSweep = removeAllJournalDraftKeys(
        target,
        prefix,
        testFixtureStorage,
      );
      if (finalSweep < 0) throw new Error("draft enumeration failed");
      removed += finalSweep;
    }
    return {
      value: removed,
      rollback: () => {
        if (target.getItem(epochKey) !== nextEpoch) return;
        if (previousEpoch === null) {
          target.removeItem(epochKey);
        } else {
          target.setItem(epochKey, previousEpoch);
        }
        for (const [key, value] of previousDrafts) {
          if (value !== null && target.getItem(key) === null) {
            target.setItem(key, value);
          }
        }
      },
    };
  }, testFixtureStorage);
  if (!result.committed || result.value < 0) return -1;
  notifyDraftHooksAfterClear(storage);
  return result.value;
}

/** Prove the destructive draft epoch and every private draft key were removed. */
export async function purgeAllDeviceLocalJournalDrafts(
  storage?: Storage | null,
): Promise<boolean> {
  const target = resolveStorage(storage);
  if (!target) return false;
  const result = await withWebPrivateRemovalGuard(
    (authorizationIsCurrent) => {
      const keys: string[] = [];
      for (const prefix of [
        LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
        WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
      ]) {
        const selected = enumerateJournalDraftKeys(
          target,
          prefix,
          authorizationIsCurrent,
        );
        if (!selected) return { value: false };
        keys.push(...selected);
      }
      keys.push(
        LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
        WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY,
      );
      for (const key of new Set(keys)) {
        if (!authorizationIsCurrent()) return { value: false };
        target.removeItem(key);
        if (target.getItem(key) !== null) return { value: false };
      }
      for (const prefix of [
        LEGACY_JOURNAL_DRAFT_STORAGE_PREFIX,
        WEB_V2_JOURNAL_DRAFT_STORAGE_PREFIX,
      ]) {
        const remaining = enumerateJournalDraftKeys(
          target,
          prefix,
          authorizationIsCurrent,
        );
        if (!remaining || remaining.length !== 0) return { value: false };
      }
      return { value: authorizationIsCurrent() };
    },
    storage !== undefined,
  );
  if (!result.committed || !result.value) return false;
  notifyDraftHooksAfterClear(storage);
  return true;
}

/**
 * Sweep stale or malformed drafts on application startup. Browser storage
 * cannot run its own clock while BibleQuest is closed, so expiry is enforced
 * at the next launch as well as whenever an individual draft is read.
 */
export async function purgeExpiredDeviceLocalJournalDrafts(
  storage?: Storage | null,
  now = Date.now(),
): Promise<number> {
  const target = resolveStorage(storage);
  if (!target) return 0;
  const testFixtureStorage = storage !== undefined;
  if (!webPrivateStorageReadAllowed(target, testFixtureStorage)) return 0;

  const clearEpoch = readDraftClearEpoch(target, testFixtureStorage);
  let removed = 0;
  const draftKeys = journalDraftKeys(target, undefined, testFixtureStorage);
  if (!draftKeys) return 0;
  for (const key of draftKeys) {
    if (!webPrivateStorageReadAllowed(target, testFixtureStorage)) {
      return removed;
    }
    let raw: string | null = null;
    try {
      raw = target.getItem(key);
      if (!webPrivateStorageReadAllowed(target, testFixtureStorage)) {
        return removed;
      }
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (
        !isRecord(parsed) ||
        parsed.version !== 2 ||
        parsed.clearEpoch !== clearEpoch ||
        typeof parsed.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(parsed.updatedAt)) ||
        now - Date.parse(parsed.updatedAt) > JOURNAL_DRAFT_MAX_AGE_MS
      ) {
        if (
          await removeQuietly(target, key, storage !== undefined, raw)
        ) {
          removed += 1;
        }
      }
    } catch {
      if (
        raw !== null &&
        await removeQuietly(target, key, storage !== undefined, raw)
      ) {
        removed += 1;
      }
    }
  }
  return removed;
}

/** Read and validate a same-scope draft. Malformed or stale values are purged. */
export function readDeviceLocalJournalDraft<T extends JournalDraftFields>(
  kind: JournalDraftKind,
  entryId?: string,
  storage?: Storage | null,
): DeviceLocalJournalDraft<T> | null {
  const target = resolveStorage(storage);
  if (!target) return null;
  const testFixtureStorage = storage !== undefined;
  if (!webPrivateStorageReadAllowed(target, testFixtureStorage)) return null;

  const key = selectedJournalDraftStorageKey(target, kind, entryId);
  if (!key) return null;
  let raw: string | null = null;
  try {
    raw = target.getItem(key);
    if (!webPrivateStorageReadAllowed(target, testFixtureStorage) || !raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    const expectedEntryId = normalizedEntryId(entryId);
    const expectedClearEpoch = readDraftClearEpoch(
      target,
      testFixtureStorage,
    );
    if (
      !isRecord(parsed) ||
      parsed.version !== 2 ||
      parsed.kind !== kind ||
      parsed.entryId !== expectedEntryId ||
      parsed.clearEpoch !== expectedClearEpoch ||
      typeof parsed.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.updatedAt)) ||
      !isDraftFields(parsed.fields)
    ) {
      void removeQuietly(target, key, storage !== undefined, raw);
      return null;
    }

    if (Date.now() - Date.parse(parsed.updatedAt) > JOURNAL_DRAFT_MAX_AGE_MS) {
      void removeQuietly(target, key, storage !== undefined, raw);
      return null;
    }

    return webPrivateStorageReadAllowed(target, testFixtureStorage)
      ? (parsed as unknown as DeviceLocalJournalDraft<T>)
      : null;
  } catch {
    if (raw !== null) {
      void removeQuietly(target, key, storage !== undefined, raw);
    }
    return null;
  }
}

/** Persist a bounded, JSON-safe draft envelope. Returns false on quota/privacy failures. */
export async function writeDeviceLocalJournalDraft<T extends JournalDraftFields>(
  kind: JournalDraftKind,
  entryId: string | undefined,
  fields: T,
  storage?: Storage | null,
  expectedClearEpoch?: string | null,
): Promise<boolean> {
  const target = resolveStorage(storage);
  if (!target || !isDraftFields(fields)) return false;
  const testFixtureStorage = storage !== undefined;
  const result = await withWebPrivateWriteGuard(() => {
    const clearEpoch = readDraftClearEpoch(target, testFixtureStorage);
    if (
      expectedClearEpoch !== undefined &&
      expectedClearEpoch !== clearEpoch
    ) {
      return { value: false };
    }
    const draft: DeviceLocalJournalDraft<T> = {
      version: 2,
      kind,
      entryId: normalizedEntryId(entryId),
      fields,
      updatedAt: new Date().toISOString(),
      clearEpoch,
    };
    const key = selectedJournalDraftStorageKey(target, kind, entryId);
    if (!key) return { value: false };
    const previous = target.getItem(key);
    const encoded = JSON.stringify(draft);
    target.setItem(key, encoded);
    if (target.getItem(key) !== encoded) {
      throw new Error("journal draft storage failed");
    }
    // A reset can race between the preflight read and setItem in another tab.
    // Recheck after the write so stale text cannot survive that ordering.
    if (readDraftClearEpoch(target, testFixtureStorage) !== clearEpoch) {
      if (target.getItem(key) === encoded) target.removeItem(key);
      return { value: false };
    }
    return {
      value: true,
      rollback: () => {
        if (target.getItem(key) !== encoded) return;
        if (previous === null) target.removeItem(key);
        else target.setItem(key, previous);
      },
    };
  }, testFixtureStorage);
  return result.committed && result.value;
}

export function clearDeviceLocalJournalDraft(
  kind: JournalDraftKind,
  entryId?: string,
  storage?: Storage | null,
): Promise<boolean> {
  const target = resolveStorage(storage);
  const key = target
    ? selectedJournalDraftStorageKey(target, kind, entryId)
    : null;
  return target
    && key
    ? removeQuietly(target, key, storage !== undefined)
    : Promise.resolve(false);
}

function defaultIsEmpty<T extends JournalDraftFields>(draft: T): boolean {
  return Object.values(draft).every(
    (field) =>
      field === null ||
      field === undefined ||
      (typeof field === "string" && !field.trim()),
  );
}

/**
 * Own a composer value while quietly recovering and autosaving its local draft.
 * Call `clearDraft()` immediately after the persisted Prayer/Reflection save.
 */
export function useDeviceLocalJournalDraft<T extends JournalDraftFields>({
  kind,
  entryId,
  initialValue,
  enabled = true,
  debounceMs = 450,
  storage,
  isEmpty = defaultIsEmpty,
  clearedValue = initialValue,
}: UseDeviceLocalJournalDraftOptions<T>): UseDeviceLocalJournalDraftResult<T> {
  const scopeKey = useMemo(
    () => journalDraftStorageKey(kind, entryId),
    [kind, entryId],
  );
  const [value, setValueState] = useState<T>(initialValue);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const suppressPersistence = useRef(false);
  const clearEpochRef = useRef<string | null>(null);

  const kindRef = useRef(kind);
  const entryIdRef = useRef(entryId);
  const initialValueRef = useRef(initialValue);
  const clearedValueRef = useRef(clearedValue);
  const valueRef = useRef(value);
  const enabledRef = useRef(enabled);
  const storageRef = useRef(storage);
  const isEmptyRef = useRef(isEmpty);

  useEffect(() => {
    kindRef.current = kind;
    entryIdRef.current = entryId;
    initialValueRef.current = initialValue;
    clearedValueRef.current = clearedValue;
    valueRef.current = value;
    enabledRef.current = enabled;
    storageRef.current = storage;
    isEmptyRef.current = isEmpty;
  }, [clearedValue, enabled, entryId, initialValue, isEmpty, kind, storage, value]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback((next) => {
    suppressPersistence.current = false;
    setValueState(next);
  }, []);

  const persistNow = useCallback(async () => {
    if (!enabledRef.current || suppressPersistence.current) return;
    const target = resolveStorage(storageRef.current);
    if (!target) return;
    if (
      readDraftClearEpoch(
        target,
        storageRef.current !== undefined,
      ) !== clearEpochRef.current
    ) {
      suppressPersistence.current = true;
      await clearDeviceLocalJournalDraft(
        kindRef.current,
        entryIdRef.current,
        storageRef.current,
      );
      return;
    }
    const current = valueRef.current;
    if (isEmptyRef.current(current)) {
      await clearDeviceLocalJournalDraft(
        kindRef.current,
        entryIdRef.current,
        storageRef.current,
      );
      setSavedAt(null);
      return;
    }

    if (
      await writeDeviceLocalJournalDraft(
        kindRef.current,
        entryIdRef.current,
        current,
        storageRef.current,
        clearEpochRef.current,
      )
    ) {
      setSavedAt(new Date().toISOString());
    }
  }, []);

  // Load after mount to remain hydration-safe when used outside ClientOnly.
  useEffect(() => {
    suppressPersistence.current = false;
    const target = resolveStorage(storageRef.current);
    clearEpochRef.current = target
      ? readDraftClearEpoch(target, storageRef.current !== undefined)
      : null;
    const draft = readDeviceLocalJournalDraft<T>(
      kindRef.current,
      entryIdRef.current,
      storageRef.current,
    );
    const nextValue = draft?.fields ?? initialValueRef.current;
    valueRef.current = nextValue;
    setValueState(nextValue);
    setRestored(Boolean(draft));
    setSavedAt(draft?.updatedAt ?? null);
  }, [scopeKey]);

  useEffect(() => {
    if (!enabled || suppressPersistence.current) return;
    const timer = window.setTimeout(
      () => void persistNow(),
      Math.max(0, debounceMs),
    );
    return () => window.clearTimeout(timer);
  }, [debounceMs, enabled, persistNow, scopeKey, value]);

  // Page transitions and app backgrounding should not discard the last keystrokes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saveBeforeHide = () => void persistNow();
    window.addEventListener("pagehide", saveBeforeHide);
    return () => window.removeEventListener("pagehide", saveBeforeHide);
  }, [persistNow]);

  // App Router transitions and iOS swipe-back can unmount without pagehide.
  // The ref-backed callback captures the latest value, while clearDraft's
  // suppression flag prevents Done/Discard from resurrecting cleared text.
  useEffect(() => () => void persistNow(), [persistNow]);

  // A destructive reset can originate in a persistent app-shell sibling while
  // a composer remains mounted behind it. Clear both its storage and memory,
  // then suppress any already-scheduled autosave from recreating the draft.
  useEffect(() => {
    if (typeof window === "undefined" || storage !== undefined) return;
    const onAllDraftsCleared = () => {
      suppressPersistence.current = true;
      // A debounce in another tab may have won the race after the initiating
      // tab removed all keys but before this tab received the clear epoch.
      // Remove this scope again so the signal is idempotently destructive.
      void clearDeviceLocalJournalDraft(
        kindRef.current,
        entryIdRef.current,
        storageRef.current,
      );
      const target = resolveStorage(storageRef.current);
      clearEpochRef.current = target
        ? readDraftClearEpoch(target, storageRef.current !== undefined)
        : null;
      const nextValue = clearedValueRef.current;
      valueRef.current = nextValue;
      setValueState(nextValue);
      setRestored(false);
      setSavedAt(null);
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === LEGACY_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY ||
        event.key === WEB_V2_JOURNAL_DRAFTS_CLEARED_STORAGE_KEY
      ) {
        onAllDraftsCleared();
      }
    };
    window.addEventListener(DRAFTS_CLEARED_EVENT, onAllDraftsCleared);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DRAFTS_CLEARED_EVENT, onAllDraftsCleared);
      window.removeEventListener("storage", onStorage);
    };
  }, [storage]);

  const clearDraft = useCallback(() => {
    suppressPersistence.current = true;
    void clearDeviceLocalJournalDraft(
      kindRef.current,
      entryIdRef.current,
      storageRef.current,
    );
    setRestored(false);
    setSavedAt(null);
  }, []);

  return {
    value,
    setValue,
    restored,
    savedAt,
    saveDraft: () => void persistNow(),
    clearDraft,
  };
}
