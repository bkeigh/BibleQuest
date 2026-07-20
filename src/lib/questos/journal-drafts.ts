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
const STORAGE_PREFIX = "biblequest:journal-draft";
const DRAFTS_CLEARED_EVENT = "biblequest:journal-drafts-cleared";
const DRAFTS_CLEARED_STORAGE_KEY = "biblequest:journal-drafts-cleared-at";

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

function removeQuietly(storage: Storage, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function journalDraftKeys(storage: Storage): string[] {
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(`${STORAGE_PREFIX}:`)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function readDraftClearEpoch(storage: Storage): string | null {
  try {
    return storage.getItem(DRAFTS_CLEARED_STORAGE_KEY);
  } catch {
    return null;
  }
}

function advanceDraftClearEpoch(
  target: Storage,
): boolean {
  // Updating a non-sensitive epoch key creates a native `storage` event in
  // every other tab. A unique suffix ensures two fast resets still notify.
  try {
    const unique =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    target.setItem(
      DRAFTS_CLEARED_STORAGE_KEY,
      `${new Date().toISOString()}:${unique}`,
    );
    return true;
  } catch {
    return false;
  }
}

function removeAllJournalDraftKeys(storage: Storage): number {
  let removed = 0;
  for (const key of journalDraftKeys(storage)) {
    if (removeQuietly(storage, key)) removed += 1;
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
export function clearAllDeviceLocalJournalDrafts(
  storage?: Storage | null,
): number {
  const target = resolveStorage(storage);
  if (!target) return 0;

  // This is the linearization point for every open tab. Writers that ran
  // before it are removed below; writers that run after it see a new epoch and
  // refuse stale content, even if their storage event has not arrived yet.
  const epochAdvanced = advanceDraftClearEpoch(target);
  let removed = removeAllJournalDraftKeys(target);
  if (!epochAdvanced) {
    // A full quota can reject the sentinel even though drafts are writable.
    // The first sweep frees space; advancing the epoch and sweeping again
    // closes the gap where another tab could otherwise rewrite old memory.
    advanceDraftClearEpoch(target);
    removed += removeAllJournalDraftKeys(target);
  }
  notifyDraftHooksAfterClear(storage);
  return removed;
}

/**
 * Sweep stale or malformed drafts on application startup. Browser storage
 * cannot run its own clock while BibleQuest is closed, so expiry is enforced
 * at the next launch as well as whenever an individual draft is read.
 */
export function purgeExpiredDeviceLocalJournalDrafts(
  storage?: Storage | null,
  now = Date.now(),
): number {
  const target = resolveStorage(storage);
  if (!target) return 0;

  const clearEpoch = readDraftClearEpoch(target);
  let removed = 0;
  for (const key of journalDraftKeys(target)) {
    try {
      const raw = target.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (
        !isRecord(parsed) ||
        parsed.version !== 2 ||
        parsed.clearEpoch !== clearEpoch ||
        typeof parsed.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(parsed.updatedAt)) ||
        now - Date.parse(parsed.updatedAt) > JOURNAL_DRAFT_MAX_AGE_MS
      ) {
        if (removeQuietly(target, key)) removed += 1;
      }
    } catch {
      if (removeQuietly(target, key)) removed += 1;
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

  const key = journalDraftStorageKey(kind, entryId);
  try {
    const raw = target.getItem(key);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    const expectedEntryId = normalizedEntryId(entryId);
    const expectedClearEpoch = readDraftClearEpoch(target);
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
      removeQuietly(target, key);
      return null;
    }

    if (Date.now() - Date.parse(parsed.updatedAt) > JOURNAL_DRAFT_MAX_AGE_MS) {
      removeQuietly(target, key);
      return null;
    }

    return parsed as unknown as DeviceLocalJournalDraft<T>;
  } catch {
    removeQuietly(target, key);
    return null;
  }
}

/** Persist a bounded, JSON-safe draft envelope. Returns false on quota/privacy failures. */
export function writeDeviceLocalJournalDraft<T extends JournalDraftFields>(
  kind: JournalDraftKind,
  entryId: string | undefined,
  fields: T,
  storage?: Storage | null,
  expectedClearEpoch?: string | null,
): boolean {
  const target = resolveStorage(storage);
  if (!target || !isDraftFields(fields)) return false;

  const clearEpoch = readDraftClearEpoch(target);
  if (
    expectedClearEpoch !== undefined &&
    expectedClearEpoch !== clearEpoch
  ) {
    removeQuietly(target, journalDraftStorageKey(kind, entryId));
    return false;
  }

  const draft: DeviceLocalJournalDraft<T> = {
    version: 2,
    kind,
    entryId: normalizedEntryId(entryId),
    fields,
    updatedAt: new Date().toISOString(),
    clearEpoch,
  };

  try {
    const key = journalDraftStorageKey(kind, entryId);
    target.setItem(key, JSON.stringify(draft));
    // A reset can race between the preflight read and setItem in another tab.
    // Recheck after the write so stale text cannot survive that ordering.
    if (readDraftClearEpoch(target) !== clearEpoch) {
      removeQuietly(target, key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceLocalJournalDraft(
  kind: JournalDraftKind,
  entryId?: string,
  storage?: Storage | null,
): boolean {
  const target = resolveStorage(storage);
  return target
    ? removeQuietly(target, journalDraftStorageKey(kind, entryId))
    : false;
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

  const persistNow = useCallback(() => {
    if (!enabledRef.current || suppressPersistence.current) return;
    const target = resolveStorage(storageRef.current);
    if (!target) return;
    if (readDraftClearEpoch(target) !== clearEpochRef.current) {
      suppressPersistence.current = true;
      clearDeviceLocalJournalDraft(
        kindRef.current,
        entryIdRef.current,
        storageRef.current,
      );
      return;
    }
    const current = valueRef.current;
    if (isEmptyRef.current(current)) {
      clearDeviceLocalJournalDraft(
        kindRef.current,
        entryIdRef.current,
        storageRef.current,
      );
      setSavedAt(null);
      return;
    }

    if (
      writeDeviceLocalJournalDraft(
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
    clearEpochRef.current = target ? readDraftClearEpoch(target) : null;
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
    const timer = window.setTimeout(persistNow, Math.max(0, debounceMs));
    return () => window.clearTimeout(timer);
  }, [debounceMs, enabled, persistNow, scopeKey, value]);

  // Page transitions and app backgrounding should not discard the last keystrokes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("pagehide", persistNow);
    return () => window.removeEventListener("pagehide", persistNow);
  }, [persistNow]);

  // App Router transitions and iOS swipe-back can unmount without pagehide.
  // The ref-backed callback captures the latest value, while clearDraft's
  // suppression flag prevents Done/Discard from resurrecting cleared text.
  useEffect(() => () => persistNow(), [persistNow]);

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
      clearDeviceLocalJournalDraft(
        kindRef.current,
        entryIdRef.current,
        storageRef.current,
      );
      const target = resolveStorage(storageRef.current);
      clearEpochRef.current = target ? readDraftClearEpoch(target) : null;
      const nextValue = clearedValueRef.current;
      valueRef.current = nextValue;
      setValueState(nextValue);
      setRestored(false);
      setSavedAt(null);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DRAFTS_CLEARED_STORAGE_KEY) onAllDraftsCleared();
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
    clearDeviceLocalJournalDraft(
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
    saveDraft: persistNow,
    clearDraft,
  };
}
