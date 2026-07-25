"use client";

import { useQuestOS } from "@/lib/questos/store";
import { clearAllDeviceLocalJournalDrafts } from "@/lib/questos/journal-drafts";
import {
  clearLocalJourneyClaimPending,
  markInitialSyncPending,
  markLocalJourneyClaimPending,
  setLastSyncedUserId,
} from "./last-user";

/** Apply the user's explicit privacy handoff choice before starting sync. */
export function prepareLocalJourneyHandoff(
  userId: string,
  startFresh: boolean,
) {
  if (startFresh) {
    useQuestOS.getState().clearAllData();
    clearAllDeviceLocalJournalDrafts();
    clearLocalJourneyClaimPending(userId);
  } else {
    markLocalJourneyClaimPending(userId);
  }
  markInitialSyncPending(userId);
  setLastSyncedUserId(userId);
}
