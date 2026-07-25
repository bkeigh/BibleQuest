import {
  DEFAULT_SETTINGS,
  type QuestOSSnapshot,
} from "@/lib/questos/types";

export const FIXED_NOW = "2026-07-16T12:00:00.000Z";

export function currentSnapshot(): QuestOSSnapshot {
  return {
    profile: {
      displayName: "Fixture Person",
      onboardingCompleted: true,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
    settings: {
      ...DEFAULT_SETTINGS,
      appearance: { ...DEFAULT_SETTINGS.appearance },
      notifications: { ...DEFAULT_SETTINGS.notifications },
      questDurationPreference: [...DEFAULT_SETTINGS.questDurationPreference],
      questCategoryPreference: [...DEFAULT_SETTINGS.questCategoryPreference],
      updatedAt: FIXED_NOW,
      notificationsUpdatedAt: FIXED_NOW,
    },
    assignments: {
      "2026-07-16": [
        {
          dateKey: "2026-07-16",
          questSlug: "fixture-walk",
          status: "started",
          pickedAt: FIXED_NOW,
          expiresAt: "2026-07-17T12:00:00.000Z",
          startedAt: FIXED_NOW,
          rerolls: 0,
        },
      ],
    },
    myQuests: {
      "fixture-walk": {
        questSlug: "fixture-walk",
        status: "paused",
        addedAt: FIXED_NOW,
        startedAt: FIXED_NOW,
        pausedAt: FIXED_NOW,
        lastActivityAt: FIXED_NOW,
        stepsDone: ["scripture", "live"],
        timesCompleted: 2,
      },
    },
    completions: [],
    prayers: [
      {
        id: "00000000-0000-4000-8000-000000000101",
        body: "fixture-prayer-body",
        category: "general",
        status: "active",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      },
    ],
    reflections: [
      {
        id: "00000000-0000-4000-8000-000000000102",
        body: "fixture-reflection-body",
        mood: "hopeful",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      },
    ],
    journeyEvents: [],
    growthEvents: [],
    earnedMilestones: [],
    bookmarks: [
      {
        id: "00000000-0000-4000-8000-000000000103",
        bookSlug: "fixture-book",
        bookName: "Fixture Book",
        chapter: 1,
        verse: 1,
        text: "fixture-verse-text",
        note: "fixture-note-text",
        createdAt: FIXED_NOW,
      },
    ],
    readingPosition: {
      bookSlug: "fixture-book",
      bookName: "Fixture Book",
      chapter: 1,
      updatedAt: FIXED_NOW,
    },
    chaptersRead: [
      { bookSlug: "fixture-book", chapter: 1, dateKey: "2026-07-16" },
    ],
    pendingMilestones: ["fixture-milestone"],
    lastVisitDateKey: "2026-07-16",
    streak: { current: 2, longest: 4, lastActiveDateKey: "2026-07-16" },
    accountNudge: {
      shownContexts: ["onboarding"],
      lastDismissedAt: FIXED_NOW,
      dismissCount: 1,
    },
  };
}

export function emptySnapshot(): QuestOSSnapshot {
  const snapshot = currentSnapshot();
  return {
    ...snapshot,
    profile: null,
    assignments: {},
    myQuests: {},
    prayers: [],
    reflections: [],
    bookmarks: [],
    chaptersRead: [],
    pendingMilestones: [],
    lastVisitDateKey: null,
    streak: { current: 0, longest: 0, lastActiveDateKey: null },
    accountNudge: {
      shownContexts: [],
      lastDismissedAt: null,
      dismissCount: 0,
    },
  };
}
