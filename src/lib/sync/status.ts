"use client";

import { create } from "zustand";

export type SyncState = "off" | "syncing" | "idle" | "error";
export type SyncIssue = "daily-quest-conflict";

interface SyncStatusStore {
  state: SyncState;
  /** ISO timestamp of the last fully successful sync. */
  lastSyncedAt: string | null;
  /** The account this status belongs to. Prevents a stale account state from
   *  opening another account's onboarding flow during an auth hand-off. */
  userId: string | null;
  /** True only after this account has completed its first pull → merge → push
   *  in the current engine run. Later write-through syncs preserve it. */
  initialSyncComplete: boolean;
  /** A bounded, content-free reason used to choose safe recovery copy. */
  issue: SyncIssue | null;
  setState: (
    state: SyncState,
    options?: {
      lastSyncedAt?: string;
      userId?: string | null;
      initialSyncComplete?: boolean;
      issue?: SyncIssue | null;
    }
  ) => void;
}

/** Tiny observable status the Account screen renders; the engine writes it. */
export const useSyncStatus = create<SyncStatusStore>((set) => ({
  state: "off",
  lastSyncedAt: null,
  userId: null,
  initialSyncComplete: false,
  issue: null,
  setState: (state, options) =>
    set((current) => ({
      state,
      lastSyncedAt: options?.lastSyncedAt ?? current.lastSyncedAt,
      userId:
        options && "userId" in options ? (options.userId ?? null) : current.userId,
      initialSyncComplete:
        options?.initialSyncComplete ?? current.initialSyncComplete,
      issue:
        options && "issue" in options
          ? (options.issue ?? null)
          : state === "error"
            ? current.issue
            : null,
    })),
}));
