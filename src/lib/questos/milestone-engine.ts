/**
 * Milestone engine — gentle pilgrimage markers, never a leaderboard.
 */
import { MEANINGFUL_JOURNEY_EVENT_TYPES } from "./types";
import {
  bookmarkJourneySourceId,
  uniqueValidJourneyEvents,
  uniqueValidQuestCompletions,
} from "./history-integrity";
import type {
  ChapterRead,
  EarnedMilestone,
  JourneyEvent,
  JourneyEventType,
  MilestoneMetric,
  MilestoneSeed,
  Prayer,
  QuestCompletion,
  QuestTemplate,
  Reflection,
  VerseBookmark,
} from "./types";

export interface MilestoneInputs {
  completions: QuestCompletion[];
  prayers: Prayer[];
  reflections: Reflection[];
  chaptersRead: ChapterRead[];
  bookmarks: VerseBookmark[];
  journeyEvents: JourneyEvent[];
  questBySlug: Map<string, QuestTemplate>;
}

const meaningfulJourneyEventTypes = new Set<JourneyEventType>(
  MEANINGFUL_JOURNEY_EVENT_TYPES
);

/** Combine source-linked history with conservative pre-link legacy coverage. */
function cumulativeActionCount(
  currentSourceIds: Iterable<string>,
  events: JourneyEvent[],
  type: JourneyEventType,
  legacyKey: (event: JourneyEvent) => string = (event) => event.id
): number {
  const matching = events.filter((event) => event.type === type);
  const linked = new Set(
    matching.flatMap((event) => (event.sourceId ? [event.sourceId] : []))
  );
  const unlinked = new Set(
    matching.filter((event) => !event.sourceId).map(legacyKey)
  );
  const currentWithoutLink = new Set(
    [...currentSourceIds].filter((sourceId) => !linked.has(sourceId))
  );
  return linked.size + Math.max(unlinked.size, currentWithoutLink.size);
}

/** Reuses the human-readable reference recorded by the bookmark action. */
function historicalBookmarkKey(event: JourneyEvent): string {
  const reference = event.detail?.trim().toLowerCase();
  return reference ? `reference:${reference}` : `event:${event.id}`;
}

export function computeMetrics(
  inputs: MilestoneInputs
): Record<MilestoneMetric, number> {
  const completions = uniqueValidQuestCompletions(inputs.completions);
  const journeyEvents = uniqueValidJourneyEvents(inputs.journeyEvents);
  const categoryCount = (category: string) =>
    completions.filter(
      (c) => inputs.questBySlug.get(c.questSlug)?.category === category
    ).length;

  // Stable source ids keep deleted actions cumulative. Unlinked legacy events
  // remain conservative until storage migration attaches their current rows.
  const prayersCreated = cumulativeActionCount(
    inputs.prayers.map((prayer) => `prayer:${prayer.id}`),
    journeyEvents,
    "prayer_created"
  );
  const reflectionsCreated = cumulativeActionCount(
    inputs.reflections.map((reflection) => `reflection:${reflection.id}`),
    journeyEvents,
    "reflection_written"
  );
  const prayersAnswered = cumulativeActionCount(
    inputs.prayers
      .filter((prayer) => prayer.status === "answered")
      .map((prayer) => `prayer-answer:${prayer.id}`),
    journeyEvents,
    "prayer_answered"
  );
  const journeyDays = new Set(
    journeyEvents
      .filter((event) => meaningfulJourneyEventTypes.has(event.type))
      .map((event) => event.dateKey)
  ).size;

  return {
    quest_completions: completions.length,
    prayers_created: prayersCreated,
    reflections_created: reflectionsCreated,
    prayers_answered: prayersAnswered,
    chapters_read: new Set(
      inputs.chaptersRead.map((c) => `${c.bookSlug}:${c.chapter}`)
    ).size,
    verses_bookmarked: cumulativeActionCount(
      inputs.bookmarks.map(bookmarkJourneySourceId),
      journeyEvents,
      "verse_bookmarked",
      historicalBookmarkKey
    ),
    quests_prayer: categoryCount("prayer"),
    quests_scripture: categoryCount("scripture"),
    quests_kindness: categoryCount("kindness"),
    quests_service: categoryCount("service"),
    quests_gratitude: categoryCount("gratitude"),
    quests_silence: categoryCount("silence"),
    quests_family: categoryCount("family"),
    quests_community: categoryCount("community"),
    quests_forgiveness: categoryCount("forgiveness"),
    quests_generosity: categoryCount("generosity"),
    quests_discipline: categoryCount("discipline"),
    quests_worship: categoryCount("worship"),
    quests_reflection: categoryCount("reflection"),
    quests_patience: categoryCount("patience"),
    journey_days: journeyDays,
  };
}

export interface PendingMilestoneResolution {
  nextKey: string | null;
  staleKeys: string[];
}

/** Finds the first revealable milestone and isolates retired catalogue keys. */
export function resolvePendingMilestones(
  pendingKeys: readonly string[],
  knownKeys: ReadonlySet<string>
): PendingMilestoneResolution {
  const nextKey = pendingKeys.find((key) => knownKeys.has(key)) ?? null;
  const staleKeys = [
    ...new Set(pendingKeys.filter((key) => !knownKeys.has(key))),
  ];
  return { nextKey, staleKeys };
}

/** Returns milestones newly earned given current metrics. */
export function checkMilestones(
  milestones: MilestoneSeed[],
  earned: EarnedMilestone[],
  metrics: Record<MilestoneMetric, number>
): MilestoneSeed[] {
  const earnedKeys = new Set(earned.map((e) => e.key));
  return milestones.filter(
    (m) =>
      !earnedKeys.has(m.key) &&
      (metrics[m.requirementMetric] ?? 0) >= m.requirementCount
  );
}
