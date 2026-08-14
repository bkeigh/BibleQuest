"use client";

import { useQuestOS } from "./store";
import { isNativeTarget } from "@/lib/platform/target";
import {
  reviewedWebPrivateWriteRemovalAllowed,
  webPrivateActiveResetCommitAllowed,
  type WebAccountOperationHandle,
} from "@/lib/supabase/web-auth-storage";
import {
  LEGACY_QUEST_JOURNEY_STORAGE_KEY,
  WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
  readWebPrivateNamespaceState,
} from "@/lib/storage/web-private-namespace";
import { isValidLocalJourneyUserId } from "@/lib/sync/last-user";
import {
  DEFAULT_SETTINGS,
  emptyAccountNudge,
  emptyStreak,
  emptyTombstones,
} from "./types";

function emptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function emptyRecord(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

/** Prove every account-associated journey field has its reviewed blank value. */
function journeyStateIsFresh(
  value: unknown,
  purgeAccount: string | null = null,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return (
    state.profile === null &&
    JSON.stringify(state.settings) === JSON.stringify(DEFAULT_SETTINGS) &&
    emptyRecord(state.assignments) &&
    emptyRecord(state.myQuests) &&
    emptyArray(state.completions) &&
    emptyArray(state.prayers) &&
    emptyArray(state.reflections) &&
    emptyArray(state.journeyEvents) &&
    emptyArray(state.growthEvents) &&
    emptyArray(state.earnedMilestones) &&
    emptyArray(state.bookmarks) &&
    state.readingPosition === null &&
    emptyArray(state.chaptersRead) &&
    emptyArray(state.recentVerses) &&
    emptyArray(state.pendingMilestones) &&
    state.lastVisitDateKey === null &&
    JSON.stringify(state.streak) === JSON.stringify(emptyStreak()) &&
    state.verseRefresh === null &&
    JSON.stringify(state.accountNudge) ===
      JSON.stringify(emptyAccountNudge()) &&
    emptyRecord(state.guidedProgress) &&
    JSON.stringify(state.tombstones) ===
      JSON.stringify({ ...emptyTombstones(), purgeAccount })
  );
}

export interface PurgePersistedJourneyOptions {
  purgeAccount?: string;
  webOperation?: WebAccountOperationHandle;
}

/** Reset the live store and prove the same blank snapshot reached storage. */
export function purgePersistedJourney(
  options: PurgePersistedJourneyOptions = {},
): boolean {
  try {
    if (!isNativeTarget() && !reviewedWebPrivateWriteRemovalAllowed()) {
      return false;
    }
    const purgeAccount = options.purgeAccount ?? null;
    if (
      purgeAccount &&
      (!options.webOperation ||
        !isValidLocalJourneyUserId(purgeAccount) ||
        !webPrivateActiveResetCommitAllowed(
          options.webOperation,
          purgeAccount,
        ))
    ) {
      return false;
    }
    useQuestOS.getState().clearAllData(
      purgeAccount ? { purgeAccount } : undefined,
    );
    if (!journeyStateIsFresh(useQuestOS.getState(), purgeAccount)) return false;
    // The normal persistence write is lock-queued and terminal modes refuse
    // it. Deletion uses this reviewed purge to remove the old bytes directly.
    window.localStorage.removeItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY);
    window.localStorage.removeItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY);
    if (
      window.localStorage.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY) !== null ||
      window.localStorage.getItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY) !== null
    ) {
      return false;
    }
    if (!purgeAccount) return true;
    if (
      !options.webOperation ||
      readWebPrivateNamespaceState(window.localStorage) !== "v2" ||
      !webPrivateActiveResetCommitAllowed(
        options.webOperation,
        purgeAccount,
      )
    ) {
      return false;
    }

    // Only this reviewed blank snapshot may be written while ordinary account
    // persistence is revoked; it carries the remote purge tombstone forward.
    const serialized = JSON.stringify({
      state: useQuestOS.getState(),
      version: 18,
    });
    window.localStorage.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, serialized);
    if (
      window.localStorage.getItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY) !==
        serialized ||
      !webPrivateActiveResetCommitAllowed(
        options.webOperation,
        purgeAccount,
      )
    ) {
      window.localStorage.removeItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY);
      return false;
    }
    const persisted = JSON.parse(serialized) as { state?: unknown };
    return journeyStateIsFresh(persisted.state, purgeAccount);
  } catch {
    return false;
  }
}
