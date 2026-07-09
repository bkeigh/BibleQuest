"use client";

/**
 * Records which account the local QuestOS store last synced with.
 *
 * Sign-out intentionally keeps the journey on the device ("Your journey stays
 * on this device"), so without this marker there is nothing that says whose
 * journey it is. If account A syncs on this browser and account B signs in
 * later, a blind initial sync would merge A's private prayers/reflections into
 * B's rows. The marker lets the UI catch that hand-off and ask before any
 * merge starts (see SyncManager), and lets the engine hard-refuse a mismatched
 * startSync.
 *
 * Lives next to the store in localStorage — deliberately NOT inside the
 * zustand persist blob, so importing/clearing store data and the sync layer
 * stay independent.
 */

const KEY = "biblequest:last-sync-user";

export function getLastSyncedUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastSyncedUserId(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, userId);
  } catch {
    // Storage unavailable (private mode quota, etc.) — sync still works, we
    // just can't remember ownership. The store itself is equally unavailable
    // then, so there is no orphaned journey to protect.
  }
}

export function clearLastSyncedUserId() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ignore — see setLastSyncedUserId.
  }
}

/**
 * True when the device's journey was last synced by a *different* account.
 * A null marker (never synced / data cleared) is not a conflict: guest data
 * adopting the first account to sign in is the intended local-first flow.
 */
export function localDataBelongsToOtherUser(userId: string): boolean {
  const last = getLastSyncedUserId();
  return last !== null && last !== userId;
}
