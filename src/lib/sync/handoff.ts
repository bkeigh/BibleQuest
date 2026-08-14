"use client";

import { purgeAllDeviceLocalJournalDrafts } from "@/lib/questos/journal-drafts";
import { purgePersistedJourney } from "@/lib/questos/purge";
import {
  markInitialSyncPending,
  markLocalJourneyClaimPending,
  setLastSyncedUserId,
} from "./last-user";
import { commitWebPrivateHandoffOwner } from "@/lib/storage/web-private-cutover";
import { isNativeTarget } from "@/lib/platform/target";
import type { WebAccountOperationHandle } from "@/lib/supabase/web-auth-storage";
import {
  accountLifecycleHandleIsCurrent,
  requireAccountLifecycleIdle,
  type AccountLifecycleHandle,
} from "@/lib/auth/account-lifecycle";

/** Apply the user's explicit privacy handoff choice before starting sync. */
export function prepareLocalJourneyHandoff(
  userId: string,
  startFresh: boolean,
  lifecycle?: AccountLifecycleHandle,
  webOperation?: WebAccountOperationHandle,
): Promise<void> {
  return prepareLocalJourneyHandoffAsync(
    userId,
    startFresh,
    lifecycle,
    webOperation,
  );
}

/** Completes the destructive handoff before publishing its new owner markers. */
async function prepareLocalJourneyHandoffAsync(
  userId: string,
  startFresh: boolean,
  lifecycle?: AccountLifecycleHandle,
  webOperation?: WebAccountOperationHandle,
): Promise<void> {
  if (lifecycle) {
    if (
      lifecycle.userId !== userId ||
      !accountLifecycleHandleIsCurrent(lifecycle)
    ) {
      throw new Error("The account handoff lifecycle changed.");
    }
  } else {
    requireAccountLifecycleIdle();
  }
  if (startFresh) {
    if (
      !purgePersistedJourney() ||
      !(await purgeAllDeviceLocalJournalDrafts())
    ) {
      throw new Error("The previous journey could not be cleared.");
    }
  }
  if (!isNativeTarget()) {
    if (
      !webOperation ||
      !(await commitWebPrivateHandoffOwner(
        webOperation,
        userId,
        !startFresh,
      ))
    ) {
      throw new Error("The account handoff owner could not be stored.");
    }
    return;
  }
  if (!startFresh) await markLocalJourneyClaimPending(userId);
  await markInitialSyncPending(userId);
  await setLastSyncedUserId(userId);
}
