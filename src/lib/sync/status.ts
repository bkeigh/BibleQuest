"use client";

import { create } from "zustand";

export type SyncState = "off" | "syncing" | "idle" | "error";

interface SyncStatusStore {
  state: SyncState;
  /** ISO timestamp of the last fully successful sync. */
  lastSyncedAt: string | null;
  setState: (state: SyncState, lastSyncedAt?: string) => void;
}

/** Tiny observable status the Account screen renders; the engine writes it. */
export const useSyncStatus = create<SyncStatusStore>((set) => ({
  state: "off",
  lastSyncedAt: null,
  setState: (state, lastSyncedAt) =>
    set((s) => ({ state, lastSyncedAt: lastSyncedAt ?? s.lastSyncedAt })),
}));
