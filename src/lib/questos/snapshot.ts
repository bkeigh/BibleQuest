import type { QuestOSSnapshot } from "./types";

/**
 * Select the complete, documented backup shape from the live Zustand state.
 * Functions, sync tombstones, and other transient internals never enter an
 * exported journey file.
 */
export function createExportSnapshot(source: QuestOSSnapshot): QuestOSSnapshot {
  return {
    profile: source.profile,
    settings: source.settings,
    assignments: source.assignments,
    myQuests: source.myQuests,
    completions: source.completions,
    prayers: source.prayers,
    reflections: source.reflections,
    journeyEvents: source.journeyEvents,
    growthEvents: source.growthEvents,
    earnedMilestones: source.earnedMilestones,
    bookmarks: source.bookmarks,
    readingPosition: source.readingPosition,
    chaptersRead: source.chaptersRead,
    recentVerses: source.recentVerses,
    pendingMilestones: source.pendingMilestones,
    lastVisitDateKey: source.lastVisitDateKey,
    streak: source.streak,
    accountNudge: source.accountNudge,
  };
}
