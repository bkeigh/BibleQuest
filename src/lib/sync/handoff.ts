"use client";

import { purgeAllDeviceLocalJournalDrafts } from "@/lib/questos/journal-drafts";
import { purgePersistedJourney } from "@/lib/questos/purge";
import {
  clearLocalJourneyClaimPending,
  markInitialSyncPending,
  markLocalJourneyClaimPending,
  setLastSyncedUserId,
} from "./last-user";
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
) {
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
      !purgeAllDeviceLocalJournalDrafts()
    ) {
      throw new Error("The previous journey could not be cleared.");
    }
    clearLocalJourneyClaimPending(userId);
  } else {
    markLocalJourneyClaimPending(userId);
  }
  markInitialSyncPending(userId);
  setLastSyncedUserId(userId);
}
