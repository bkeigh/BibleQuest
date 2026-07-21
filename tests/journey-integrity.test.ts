import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedMilestones } from "@/data/seed/milestones";
import { questBySlug } from "@/data/seed/quests";
import {
  computeMetrics,
  resolvePendingMilestones,
} from "@/lib/questos/milestone-engine";
import { useQuestOS } from "@/lib/questos/store";
import {
  ensureCurrentJourneyEvents,
  rebuildStreakFromJourneyEvents,
} from "@/lib/questos/history-integrity";
import { currentSnapshot, FIXED_NOW } from "./fixtures";

/** Reusable passage fixture for bookmark lifecycle tests. */
const BOOKMARK = {
  bookSlug: "john",
  bookName: "John",
  chapter: 3,
  verse: 16,
  text: "For God so loved the world...",
};

describe("Journey integrity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    useQuestOS.getState().clearAllData();
  });

  it("skips and isolates retired pending milestone keys", () => {
    const resolution = resolvePendingMilestones(
      ["retired", "retired", "first-prayer", "also-retired"],
      new Set(["first-prayer"])
    );

    expect(resolution).toEqual({
      nextKey: "first-prayer",
      staleKeys: ["retired", "also-retired"],
    });
  });

  it("advances the candle only for meaningful Journey actions", () => {
    useQuestOS.getState().addPrayer({
      body: "Stay near today.",
      category: "general",
    });
    expect(useQuestOS.getState().streak).toEqual({
      current: 1,
      longest: 1,
      lastActiveDateKey: "2026-07-16",
    });

    // A bookmark and its automatic milestone land on the next day, but
    // neither activity represents a new day of lived practice.
    vi.setSystemTime("2026-07-17T12:00:00.000Z");
    expect(useQuestOS.getState().toggleBookmark(BOOKMARK)).toBe(true);
    expect(useQuestOS.getState().streak.lastActiveDateKey).toBe("2026-07-16");

    // The skipped meaningful day therefore starts a fresh candle.
    vi.setSystemTime("2026-07-18T12:00:00.000Z");
    useQuestOS.getState().addReflection({ body: "I noticed grace." });
    expect(useQuestOS.getState().streak).toEqual({
      current: 1,
      longest: 1,
      lastActiveDateKey: "2026-07-18",
    });
  });

  it("keeps cumulative private-action metrics after entries are deleted", () => {
    const prayer = useQuestOS.getState().addPrayer({
      body: "Please make a way.",
      category: "general",
    });
    useQuestOS.getState().markPrayerAnswered(prayer.id, "A way opened.");
    const { reflection } = useQuestOS
      .getState()
      .addReflection({ body: "Remember this answer." });

    // Re-saving the same passage produces two historical events, but remains
    // one distinct bookmarked passage for milestone purposes.
    useQuestOS.getState().toggleBookmark(BOOKMARK);
    useQuestOS.getState().toggleBookmark(BOOKMARK);
    useQuestOS.getState().toggleBookmark(BOOKMARK);
    useQuestOS.getState().toggleBookmark(BOOKMARK);
    useQuestOS.getState().deletePrayer(prayer.id);
    useQuestOS.getState().deleteReflection(reflection.id);

    const state = useQuestOS.getState();
    const metrics = computeMetrics({
      completions: state.completions,
      prayers: state.prayers,
      reflections: state.reflections,
      chaptersRead: state.chaptersRead,
      bookmarks: state.bookmarks,
      journeyEvents: state.journeyEvents,
      questBySlug,
    });

    expect(state.prayers).toEqual([]);
    expect(state.reflections).toEqual([]);
    expect(state.bookmarks).toEqual([]);
    expect(metrics.prayers_created).toBe(1);
    expect(metrics.prayers_answered).toBe(1);
    expect(metrics.reflections_created).toBe(1);
    expect(metrics.verses_bookmarked).toBe(1);
  });

  it("preserves mixed legacy and new private-action totals after deletion", () => {
    const legacy = currentSnapshot();
    legacy.reflections = [];
    legacy.bookmarks = [];
    legacy.chaptersRead = [];
    useQuestOS.getState().importData(legacy);

    const modern = useQuestOS.getState().addPrayer({
      body: "A second prayer.",
      category: "general",
    });
    useQuestOS.getState().deletePrayer(legacy.prayers[0].id);
    useQuestOS.getState().deletePrayer(modern.id);

    const state = useQuestOS.getState();
    const metrics = computeMetrics({
      completions: state.completions,
      prayers: state.prayers,
      reflections: state.reflections,
      chaptersRead: state.chaptersRead,
      bookmarks: state.bookmarks,
      journeyEvents: state.journeyEvents,
      questBySlug,
    });
    expect(metrics.prayers_created).toBe(2);
  });

  it("links legacy records once and rebuilds streaks from meaningful days", () => {
    const prayer = currentSnapshot().prayers[0];
    const duplicateLegacyEvent = {
      id: "legacy-prayer-event",
      type: "prayer_created" as const,
      title: "Prayer written",
      dateKey: "2026-07-16",
      occurredAt: prayer.createdAt,
    };
    const linked = ensureCurrentJourneyEvents(
      {
        prayers: [prayer],
        reflections: [],
        bookmarks: [],
        journeyEvents: [duplicateLegacyEvent, duplicateLegacyEvent],
      },
      () => "unused-id"
    );

    expect(linked).toHaveLength(1);
    expect(linked[0].sourceId).toBe(`prayer:${prayer.id}`);
    expect(
      rebuildStreakFromJourneyEvents([
        linked[0],
        {
          id: "meaningful-day-two",
          type: "reflection_written",
          title: "Reflection written",
          dateKey: "2026-07-17",
          occurredAt: "2026-07-17T12:00:00.000Z",
        },
        {
          id: "bookmark-only-day",
          type: "verse_bookmarked",
          title: "Verse saved",
          dateKey: "2026-07-18",
          occurredAt: "2026-07-18T12:00:00.000Z",
        },
      ])
    ).toEqual({
      current: 2,
      longest: 2,
      lastActiveDateKey: "2026-07-17",
    });
  });

  it("quietly and idempotently reconciles satisfied imported milestones", () => {
    useQuestOS.getState().importData(currentSnapshot());
    const before = useQuestOS.getState();

    const reconciled = before.reconcileMilestones();
    expect(reconciled.map((milestone) => milestone.key)).toEqual([
      "first-prayer",
      "first-reflection",
      "first-chapter",
      "first-bookmark",
    ]);

    const after = useQuestOS.getState();
    expect(after.earnedMilestones).toEqual(
      reconciled.map((milestone) => ({
        key: milestone.key,
        achievedAt: FIXED_NOW,
      }))
    );
    expect(after.pendingMilestones).toEqual(before.pendingMilestones);
    expect(after.journeyEvents).toBe(before.journeyEvents);
    expect(after.growthEvents).toBe(before.growthEvents);
    expect(after.streak).toBe(before.streak);

    const earned = after.earnedMilestones;
    expect(after.reconcileMilestones()).toEqual([]);
    expect(useQuestOS.getState().earnedMilestones).toBe(earned);
  });

  it("records an intentionally completed chapter only once", () => {
    const first = useQuestOS.getState().markChapterRead("john", "John", 1);
    const second = useQuestOS.getState().markChapterRead("john", "John", 1);
    const state = useQuestOS.getState();

    expect(first.newMilestones.map((milestone) => milestone.key)).toContain(
      "first-chapter"
    );
    expect(second.newMilestones).toEqual([]);
    expect(state.chaptersRead).toEqual([
      { bookSlug: "john", chapter: 1, dateKey: "2026-07-16" },
    ]);
    expect(
      state.journeyEvents.filter((event) => event.type === "chapter_read")
    ).toHaveLength(1);
    expect(
      state.growthEvents.filter((event) => event.sourceType === "chapter_read")
    ).toHaveLength(1);
  });

  it("renames Seven Mornings without changing its persisted key", () => {
    expect(
      seedMilestones.find((milestone) => milestone.key === "seven-mornings")
        ?.title
    ).toBe("Seven Days");
  });
});
