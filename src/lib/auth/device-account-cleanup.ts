"use client";

import { purgePersistedJourney } from "@/lib/questos/purge";
import { purgeAllDeviceLocalJournalDrafts } from "@/lib/questos/journal-drafts";
import { clearLastSyncedUserId, readLocalJourneyOwner } from "@/lib/sync/last-user";
import { removeStoredAccountSyncGeneration } from "@/lib/sync/generation";
import { removeStoredDailyQuestSyncContext } from "@/lib/sync/daily-quests";
import { removeStoredMutableRevisionContext } from "@/lib/sync/mutable-revisions";
import { clearNativeAuthStorageForUser } from "@/lib/supabase/native-auth-storage";
import { clearRhythmState } from "@/lib/rhythm/client";
import { clearGameProgress } from "@/lib/games/storage";
import { clearSevenDaysProgress } from "@/lib/games/seven-days/progress";
import { SEVEN_DAYS_TUTORIAL_STORAGE_KEY } from "@/lib/games/seven-days/tutorial";
import { BOOST_STORAGE_KEY } from "@/lib/games/arcade/boosts";
import { purgeAvatarCache } from "@/lib/utils/avatar";
import {
  purgeJourneyBackup,
  resumeJourneyBackupAfterPurge,
} from "@/lib/native/journey-backup";
import { purgeNativeReminders } from "@/lib/native/reminders";
import {
  accountLifecycleHandleIsCurrent,
  beginAccountLifecycle,
  finishAccountLifecycle,
  type AccountLifecycleHandle,
} from "./account-lifecycle";

let cleanupRun: { promise: Promise<boolean>; userId: string } | null = null;

/** Clear game records that live outside the persisted journey store. */
export function clearStandaloneGameData(): boolean {
  const gameProgressCleared = clearGameProgress();
  const sevenDaysCleared = clearSevenDaysProgress();
  let complete = gameProgressCleared && sevenDaysCleared;
  try {
    window.localStorage.removeItem(SEVEN_DAYS_TUTORIAL_STORAGE_KEY);
    window.localStorage.removeItem(BOOST_STORAGE_KEY);
    complete =
      complete &&
      window.localStorage.getItem(SEVEN_DAYS_TUTORIAL_STORAGE_KEY) === null &&
      window.localStorage.getItem(BOOST_STORAGE_KEY) === null;
  } catch {
    complete = false;
  }
  return complete;
}

/**
 * Purge a terminally deleted account only when the device owner still matches.
 * Unknown, guest, and different-account states are never erased by this path.
 */
export function purgeDeletedAccountDeviceData(
  userId: string,
  lifecycle?: AccountLifecycleHandle,
): Promise<boolean> {
  if (cleanupRun) {
    return cleanupRun.userId === userId
      ? cleanupRun.promise
      : Promise.resolve(false);
  }

  const ownedLifecycle = lifecycle ? null : beginAccountLifecycle(userId);
  const handle = lifecycle ?? ownedLifecycle;
  if (
    !handle ||
    handle.userId !== userId ||
    !accountLifecycleHandleIsCurrent(handle)
  ) {
    return Promise.resolve(false);
  }

  const promise = runDeletedAccountCleanup(handle).finally(() => {
    if (cleanupRun?.promise === promise) cleanupRun = null;
    if (ownedLifecycle) finishAccountLifecycle(ownedLifecycle);
  });
  cleanupRun = { promise, userId };
  return promise;
}

/** Stop sync, tombstone the mirror, then clear each isolated device store. */
async function runDeletedAccountCleanup(
  lifecycle: AccountLifecycleHandle,
): Promise<boolean> {
  const userId = lifecycle.userId;
  const boundaryIsCurrent = () => {
    const owner = readLocalJourneyOwner();
    return (
      accountLifecycleHandleIsCurrent(lifecycle) &&
      owner.status === "owned" &&
      owner.userId === userId
    );
  };

  if (!accountLifecycleHandleIsCurrent(lifecycle)) return false;
  const entryOwner = readLocalJourneyOwner();
  if (
    entryOwner.status !== "owned" ||
    entryOwner.userId !== userId
  ) {
    // A terminal credential is still removable when no local journey is
    // attributed to it, but unknown ownership never authorizes a local clear.
    const credential = await clearNativeAuthStorageForUser(userId);
    return (
      accountLifecycleHandleIsCurrent(lifecycle) &&
      entryOwner.status !== "unavailable" &&
      credential !== "unavailable"
    );
  }

  // Dynamic import avoids a static auth -> sync engine -> auth client cycle.
  const { stopSync } = await import("@/lib/sync/engine");
  if (!boundaryIsCurrent()) return false;
  stopSync();
  if (!(await purgeJourneyBackup())) return false;
  if (!boundaryIsCurrent()) return false;

  let complete = true;
  let primaryReset = false;
  let ownerCleared = false;
  try {
    // No await may split this owner check from the account-scoped local reset.
    if (!boundaryIsCurrent()) return false;
    if (!purgePersistedJourney()) {
      // Keep every owner boundary and device store intact for a safe retry.
      return false;
    }
    primaryReset = true;
    for (const clear of [
      purgeAllDeviceLocalJournalDrafts,
      () => {
        if (!removeStoredAccountSyncGeneration(userId)) {
          throw new Error("account generation cleanup unavailable");
        }
        return true;
      },
      () => {
        if (!removeStoredDailyQuestSyncContext(userId)) {
          throw new Error("daily quest cleanup unavailable");
        }
        return true;
      },
      () => {
        if (!removeStoredMutableRevisionContext(userId)) {
          throw new Error("mutable revision cleanup unavailable");
        }
        return true;
      },
      clearRhythmState,
      clearStandaloneGameData,
    ]) {
      try {
        if (!clear()) complete = false;
      } catch {
        complete = false;
      }
    }
    for (const clear of [purgeNativeReminders, purgeAvatarCache]) {
      if (!boundaryIsCurrent()) return false;
      try {
        const result = await clear();
        if (result === false) complete = false;
      } catch {
        complete = false;
      }
      if (!boundaryIsCurrent()) return false;
    }

    // Retain both the owner and credential on a partial purge. A fresh server
    // verification can then recognize the deleted subject and retry every
    // device-only store instead of silently turning remnants into guest data.
    if (!complete) return false;
    try {
      clearLastSyncedUserId();
      ownerCleared = true;
    } catch {
      return false;
    }
    const credential = await clearNativeAuthStorageForUser(userId);
    if (!accountLifecycleHandleIsCurrent(lifecycle)) return false;
    if (credential === "unavailable") complete = false;
  } finally {
    // Resume only after both the primary and its durable owner were removed.
    if (
      primaryReset &&
      ownerCleared &&
      accountLifecycleHandleIsCurrent(lifecycle)
    ) {
      resumeJourneyBackupAfterPurge();
    }
  }
  return complete && primaryReset && ownerCleared;
}
