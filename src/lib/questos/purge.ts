"use client";

import { useQuestOS } from "./store";
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
function journeyStateIsFresh(value: unknown): boolean {
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
    JSON.stringify(state.tombstones) === JSON.stringify(emptyTombstones())
  );
}

/** Reset the live store and prove the same blank snapshot reached storage. */
export function purgePersistedJourney(): boolean {
  try {
    useQuestOS.getState().clearAllData();
    if (!journeyStateIsFresh(useQuestOS.getState())) return false;
    const persisted = useQuestOS.persist.getOptions().storage?.getItem(
      "biblequest:v1",
    );
    if (
      !persisted ||
      (typeof persisted === "object" && "then" in persisted)
    ) {
      return false;
    }
    return journeyStateIsFresh(persisted.state);
  } catch {
    return false;
  }
}
