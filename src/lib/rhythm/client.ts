"use client";

import { useSyncExternalStore } from "react";
import {
  EMPTY_RHYTHM_STATE,
  FREE_RHYTHM_BLOCK_LIMIT,
  PLUS_RHYTHM_BLOCK_LIMIT,
  type RhythmBlock,
  type RhythmState,
} from "./types";
import { parseRhythmState } from "./validation";
import {
  captureWebPrivateStorageReadLease,
  removeWebPrivateStorageItem,
  webPrivateStorageReadAllowed,
  webPrivateStorageReadLeaseIsCurrent,
  withWebPrivateWriteGuard,
} from "@/lib/storage/web-private-write";
import {
  LEGACY_RHYTHM_STORAGE_KEY,
  WEB_V2_RHYTHM_STORAGE_KEY,
  selectedWebPrivateStorageKey,
} from "@/lib/storage/web-private-namespace";
import {
  registerWebPrivateMemoryReset,
  type WebPrivateReadLease,
} from "@/lib/supabase/web-auth-storage";

export const RHYTHM_STORAGE_KEY = LEGACY_RHYTHM_STORAGE_KEY;

let currentState: RhythmState = EMPTY_RHYTHM_STATE;
let loaded = false;
let currentReadLease: WebPrivateReadLease | null = null;
let hasCurrentReadLease = false;
const listeners = new Set<() => void>();

/** Resolves the atomically selected guest or installed-account namespace. */
function rhythmStorageKey(storage: Storage): string | null {
  return selectedWebPrivateStorageKey(
    storage,
    LEGACY_RHYTHM_STORAGE_KEY,
    WEB_V2_RHYTHM_STORAGE_KEY,
  );
}

/** Clears account-associated module state before another subject can read it. */
function revokeRhythmPrivateMemory(): void {
  const changed = loaded || currentState !== EMPTY_RHYTHM_STATE;
  currentState = EMPTY_RHYTHM_STATE;
  loaded = false;
  currentReadLease = null;
  hasCurrentReadLease = false;
  if (changed) listeners.forEach((listener) => listener());
}

/** Loads one validated state only while the exact private read lease survives. */
function loadState(): RhythmState {
  if (typeof window === "undefined") return EMPTY_RHYTHM_STATE;
  try {
    if (!webPrivateStorageReadAllowed(window.localStorage)) {
      return EMPTY_RHYTHM_STATE;
    }
    const lease = captureWebPrivateStorageReadLease(window.localStorage);
    if (!webPrivateStorageReadLeaseIsCurrent(lease, window.localStorage)) {
      return EMPTY_RHYTHM_STATE;
    }
    const key = rhythmStorageKey(window.localStorage);
    if (!key) return EMPTY_RHYTHM_STATE;
    const raw = window.localStorage.getItem(key);
    if (!webPrivateStorageReadLeaseIsCurrent(lease, window.localStorage)) {
      return EMPTY_RHYTHM_STATE;
    }
    currentReadLease = lease;
    hasCurrentReadLease = true;
    if (!raw) return EMPTY_RHYTHM_STATE;
    const parsed = parseRhythmState(JSON.parse(raw));
    if (!webPrivateStorageReadLeaseIsCurrent(lease, window.localStorage)) {
      return EMPTY_RHYTHM_STATE;
    }
    return parsed ?? EMPTY_RHYTHM_STATE;
  } catch {
    return EMPTY_RHYTHM_STATE;
  }
}

/** Initializes the client cache once and keeps server rendering deterministic. */
function ensureLoaded(): boolean {
  if (typeof window === "undefined") return false;
  if (
    !webPrivateStorageReadAllowed(window.localStorage) ||
    (loaded &&
      (!hasCurrentReadLease ||
        !webPrivateStorageReadLeaseIsCurrent(
          currentReadLease,
          window.localStorage,
        )))
  ) {
    revokeRhythmPrivateMemory();
    return false;
  }
  if (loaded) return true;
  currentState = loadState();
  loaded = webPrivateStorageReadAllowed(window.localStorage);
  return loaded;
}

/** Publishes an immutable state only after the guarded durable write commits. */
async function publish(next: RhythmState): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const encoded = JSON.stringify(next);
  if (!hasCurrentReadLease) return false;
  const lease = currentReadLease;
  const result = await withWebPrivateWriteGuard(() => {
    const key = rhythmStorageKey(window.localStorage);
    if (!key) return { value: false };
    const previous = window.localStorage.getItem(key);
    window.localStorage.setItem(key, encoded);
    if (window.localStorage.getItem(key) !== encoded) {
      throw new Error("rhythm storage failed");
    }
    return {
      value: true,
      rollback: () => {
        if (window.localStorage.getItem(key) !== encoded) return;
        if (previous === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, previous);
      },
    };
  }, false, {
    expectedReadLease: lease,
    readStorage: window.localStorage,
  });
  if (!result.committed || !result.value) return false;
  if (!webPrivateStorageReadAllowed(window.localStorage)) {
    revokeRhythmPrivateMemory();
    return false;
  }
  currentState = next;
  loaded = true;
  listeners.forEach((listener) => listener());
  return true;
}

/** Supplies a stable external-store snapshot for React consumers. */
function snapshot(): RhythmState {
  if (!ensureLoaded()) return EMPTY_RHYTHM_STATE;
  return currentState;
}

/** Subscribes to local and same-origin cross-tab rhythm changes. */
function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key !== LEGACY_RHYTHM_STORAGE_KEY &&
      event.key !== WEB_V2_RHYTHM_STORAGE_KEY
    ) {
      return;
    }
    currentState = loadState();
    loaded = true;
    listeners.forEach((subscriber) => subscriber());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reads the validated rhythm state outside React for export and reset flows. */
export function readRhythmState(): RhythmState {
  return ensureLoaded() ? currentState : EMPTY_RHYTHM_STATE;
}

/** Replaces all device-local rhythm data through the same validation boundary. */
export function replaceRhythmState(value: unknown): Promise<boolean> {
  const parsed = parseRhythmState(value);
  return parsed && ensureLoaded()
    ? publish(parsed)
    : Promise.resolve(false);
}

/** Creates or updates one block while enforcing the active plan's block limit. */
export function saveRhythmBlock(
  block: RhythmBlock,
  isPlus: boolean,
): Promise<boolean> {
  if (!ensureLoaded()) return Promise.resolve(false);
  const exists = currentState.blocks.some((entry) => entry.id === block.id);
  const limit = isPlus ? PLUS_RHYTHM_BLOCK_LIMIT : FREE_RHYTHM_BLOCK_LIMIT;
  const editableIds = new Set(
    [...currentState.blocks]
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map((entry) => entry.id),
  );
  // Preserve lapsed Plus schedules, but never let a Free client mutate them.
  if (exists && !editableIds.has(block.id)) return Promise.resolve(false);
  if (!exists && currentState.blocks.length >= limit) {
    return Promise.resolve(false);
  }
  const blocks = exists
    ? currentState.blocks.map((entry) => (entry.id === block.id ? block : entry))
    : [...currentState.blocks, block];
  const parsed = parseRhythmState({ version: 1, blocks });
  return parsed ? publish(parsed) : Promise.resolve(false);
}

/** Removes one schedule without changing prayer or notification preferences. */
export function removeRhythmBlock(id: string): Promise<boolean> {
  if (!ensureLoaded()) return Promise.resolve(false);
  if (!currentState.blocks.some((block) => block.id === id)) {
    return Promise.resolve(true);
  }
  return publish({
    version: 1,
    blocks: currentState.blocks.filter((block) => block.id !== id),
  });
}

/** Clears rhythm data alongside the app's explicit Clear Data operation. */
export async function clearRhythmState(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const key = rhythmStorageKey(window.localStorage);
  if (!key) return false;
  const removed = await removeWebPrivateStorageItem(
    window.localStorage,
    key,
  );
  if (!removed) return false;
  currentState = EMPTY_RHYTHM_STATE;
  loaded = true;
  listeners.forEach((listener) => listener());
  return true;
}

/** Removes both namespaces after terminal deletion while preserving neither. */
export async function purgeRhythmState(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const results = await Promise.all([
    removeWebPrivateStorageItem(
      window.localStorage,
      LEGACY_RHYTHM_STORAGE_KEY,
    ),
    removeWebPrivateStorageItem(
      window.localStorage,
      WEB_V2_RHYTHM_STORAGE_KEY,
    ),
  ]);
  if (results.some((result) => !result)) return false;
  currentState = EMPTY_RHYTHM_STATE;
  loaded = true;
  listeners.forEach((listener) => listener());
  return true;
}

/** Exposes the validated device-local schedule as a React external store. */
export function useRhythmState(): RhythmState {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_RHYTHM_STATE);
}

// Auth rotation synchronously revokes cached schedules before UI can re-read.
registerWebPrivateMemoryReset(revokeRhythmPrivateMemory);

/** Resets module state for isolated tests without mutating browser storage. */
export function resetRhythmClientForTests() {
  revokeRhythmPrivateMemory();
  listeners.clear();
}
