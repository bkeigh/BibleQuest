import type { QuestOSSnapshot } from "./types";

/**
 * Select the complete, documented backup shape from the live Zustand state.
 * Functions, sync tombstones, and other transient internals never enter an
 * exported journey file.
 */
export function createExportSnapshot(source: QuestOSSnapshot): QuestOSSnapshot {
  // The marker is meaningful only beside this browser's IndexedDB image.
  // Omitting it prevents a restore on another device from claiming a missing
  // or unrelated local photo.
  const profile = source.profile
    ? {
        ...source.profile,
        avatarVersion: undefined,
        avatarUpdatedAt: undefined,
      }
    : null;

  return {
    profile,
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
