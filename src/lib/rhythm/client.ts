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

export const RHYTHM_STORAGE_KEY = "biblequest:rhythm:v1";

let currentState: RhythmState = EMPTY_RHYTHM_STATE;
let loaded = false;
const listeners = new Set<() => void>();

/** Loads one validated device-local state without allowing malformed recovery. */
function loadState(): RhythmState {
  if (typeof window === "undefined") return EMPTY_RHYTHM_STATE;
  try {
    const raw = window.localStorage.getItem(RHYTHM_STORAGE_KEY);
    if (!raw) return EMPTY_RHYTHM_STATE;
    return parseRhythmState(JSON.parse(raw)) ?? EMPTY_RHYTHM_STATE;
  } catch {
    return EMPTY_RHYTHM_STATE;
  }
}

/** Initializes the client cache once and keeps server rendering deterministic. */
function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  currentState = loadState();
  loaded = true;
}

/** Publishes an immutable state after durable localStorage succeeds. */
function publish(next: RhythmState): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  currentState = next;
  loaded = true;
  listeners.forEach((listener) => listener());
  return true;
}

/** Supplies a stable external-store snapshot for React consumers. */
function snapshot(): RhythmState {
  ensureLoaded();
  return currentState;
}

/** Subscribes to local and same-origin cross-tab rhythm changes. */
function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== RHYTHM_STORAGE_KEY) return;
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
  ensureLoaded();
  return currentState;
}

/** Replaces all device-local rhythm data through the same validation boundary. */
export function replaceRhythmState(value: unknown): boolean {
  const parsed = parseRhythmState(value);
  return parsed ? publish(parsed) : false;
}

/** Creates or updates one block while enforcing the active plan's block limit. */
export function saveRhythmBlock(
  block: RhythmBlock,
  isPlus: boolean,
): boolean {
  ensureLoaded();
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
  if (exists && !editableIds.has(block.id)) return false;
  if (!exists && currentState.blocks.length >= limit) return false;
  const blocks = exists
    ? currentState.blocks.map((entry) => (entry.id === block.id ? block : entry))
    : [...currentState.blocks, block];
  const parsed = parseRhythmState({ version: 1, blocks });
  return parsed ? publish(parsed) : false;
}

/** Removes one schedule without changing prayer or notification preferences. */
export function removeRhythmBlock(id: string): boolean {
  ensureLoaded();
  if (!currentState.blocks.some((block) => block.id === id)) return true;
  return publish({
    version: 1,
    blocks: currentState.blocks.filter((block) => block.id !== id),
  });
}

/** Clears rhythm data alongside the app's explicit Clear Data operation. */
export function clearRhythmState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(RHYTHM_STORAGE_KEY);
  } catch {
    return false;
  }
  currentState = EMPTY_RHYTHM_STATE;
  loaded = true;
  listeners.forEach((listener) => listener());
  return true;
}

/** Exposes the validated device-local schedule as a React external store. */
export function useRhythmState(): RhythmState {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_RHYTHM_STATE);
}

/** Resets module state for isolated tests without mutating browser storage. */
export function resetRhythmClientForTests() {
  currentState = EMPTY_RHYTHM_STATE;
  loaded = false;
  listeners.clear();
}
