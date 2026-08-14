"use client";

import { purgePersistedJourney } from "@/lib/questos/purge";
import { purgeAllDeviceLocalJournalDrafts } from "@/lib/questos/journal-drafts";
import { clearLastSyncedUserId, readLocalJourneyOwner } from "@/lib/sync/last-user";
import { removeStoredAccountSyncGeneration } from "@/lib/sync/generation";
import { removeStoredDailyQuestSyncContext } from "@/lib/sync/daily-quests";
import { removeStoredMutableRevisionContext } from "@/lib/sync/mutable-revisions";
import { clearNativeAuthStorageForUser } from "@/lib/supabase/native-auth-storage";
import {
  clearExpectedWebAuthSubject,
  confirmTerminalWebPrivateDataPurge,
  withWebAccountOperationLock,
  type WebAccountOperationHandle,
} from "@/lib/supabase/web-auth-storage";
import { isNativeTarget } from "@/lib/platform/target";
import { purgeRhythmState } from "@/lib/rhythm/client";
import { purgeGameProgress } from "@/lib/games/storage";
import { purgeSevenDaysProgress } from "@/lib/games/seven-days/progress";
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
import { clearSignInTrackingStamp } from "./sign-in-tracking";
import { removeWebPrivateStorageItem } from "@/lib/storage/web-private-write";
import {
  LEGACY_ARCADE_BOOST_STORAGE_KEY,
  LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
  WEB_V2_ARCADE_BOOST_STORAGE_KEY,
  WEB_V2_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
} from "@/lib/storage/web-private-namespace";
import {
  proveAllWebPrivateDataNamespacesEmpty,
  purgeAllWebPrivateDataNamespaces,
} from "@/lib/storage/web-private-cutover";

let cleanupRun: { promise: Promise<boolean>; userId: string } | null = null;

/** Clears only the proved-deleted subject through this platform's auth store. */
async function clearDeletedAccountCredential(userId: string) {
  return isNativeTarget()
    ? clearNativeAuthStorageForUser(userId)
    : clearExpectedWebAuthSubject(userId);
}

/** Clear game records that live outside the persisted journey store. */
export async function clearStandaloneGameData(): Promise<boolean> {
  const [gameProgressCleared, sevenDaysCleared] = await Promise.all([
    purgeGameProgress(),
    purgeSevenDaysProgress(),
  ]);
  let complete = gameProgressCleared && sevenDaysCleared;
  try {
    const standaloneKeys = [
      LEGACY_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
      WEB_V2_SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
      LEGACY_ARCADE_BOOST_STORAGE_KEY,
      WEB_V2_ARCADE_BOOST_STORAGE_KEY,
    ];
    const removed = await Promise.all(
      standaloneKeys.map((key) =>
        removeWebPrivateStorageItem(window.localStorage, key),
      ),
    );
    complete =
      complete &&
      removed.every(Boolean);
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
  webOperation?: WebAccountOperationHandle,
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

  // A newly acquired web operation must be threaded into every reviewed purge.
  const cleanup = (activeWebOperation?: WebAccountOperationHandle) =>
    runDeletedAccountCleanup(handle, activeWebOperation);
  const operation = isNativeTarget()
    ? cleanup()
    : withWebAccountOperationLock(cleanup, webOperation).catch(() => false);
  const promise = operation.finally(() => {
    if (cleanupRun?.promise === promise) cleanupRun = null;
    if (ownedLifecycle) finishAccountLifecycle(ownedLifecycle);
  });
  cleanupRun = { promise, userId };
  return promise;
}

/** Stop sync, tombstone the mirror, then clear each isolated device store. */
async function runDeletedAccountCleanup(
  lifecycle: AccountLifecycleHandle,
  webOperation?: WebAccountOperationHandle,
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
    // A different or unreadable owner cannot authorize any terminal mutation.
    if (entryOwner.status !== "unowned") return false;
    // Unknown native residue cannot authorize clearing a terminal credential.
    if (isNativeTarget() || !webOperation) return false;
    const privateDataAbsent = await confirmTerminalWebPrivateDataPurge(
      webOperation,
      userId,
      async () =>
        (await proveAllWebPrivateDataNamespacesEmpty()) &&
        readLocalJourneyOwner().status === "unowned",
    );
    if (!privateDataAbsent) return false;
    const credential = await clearDeletedAccountCredential(userId);
    return (
      accountLifecycleHandleIsCurrent(lifecycle) &&
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
    const nativeOnlyMetadataClearers = isNativeTarget()
      ? [
          async () => {
            if (!(await removeStoredAccountSyncGeneration(userId))) {
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
          clearSignInTrackingStamp,
        ]
      : [];
    for (const clear of [
      purgeAllDeviceLocalJournalDrafts,
      purgeRhythmState,
      clearStandaloneGameData,
      ...nativeOnlyMetadataClearers,
    ]) {
      try {
        if (!(await clear())) complete = false;
      } catch {
        complete = false;
      }
      if (!boundaryIsCurrent()) return false;
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

    if (!isNativeTarget()) {
      if (!boundaryIsCurrent() || !webOperation) return false;
      if (
        !(await confirmTerminalWebPrivateDataPurge(
          webOperation,
          userId,
          purgeAllWebPrivateDataNamespaces,
        ))
      ) {
        return false;
      }
      if (!accountLifecycleHandleIsCurrent(lifecycle)) return false;
    }

    // Retain both the owner and credential on a partial purge. A fresh server
    // verification can then recognize the deleted subject and retry every
    // device-only store instead of silently turning remnants into guest data.
    if (!complete) return false;
    try {
      await clearLastSyncedUserId();
      ownerCleared = true;
    } catch {
      return false;
    }
    const credential = await clearDeletedAccountCredential(userId);
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
