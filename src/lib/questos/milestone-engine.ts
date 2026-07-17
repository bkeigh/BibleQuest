/**
 * Milestone engine — gentle pilgrimage markers, never a leaderboard.
 */
import type {
  ChapterRead,
  EarnedMilestone,
  JourneyEvent,
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

export function computeMetrics(
  inputs: MilestoneInputs
): Record<MilestoneMetric, number> {
  const categoryCount = (category: string) =>
    inputs.completions.filter(
      (c) => inputs.questBySlug.get(c.questSlug)?.category === category
    ).length;

  return {
    quest_completions: inputs.completions.length,
    prayers_created: inputs.prayers.length,
    reflections_created: inputs.reflections.length,
    prayers_answered: inputs.prayers.filter((p) => p.status === "answered")
      .length,
    chapters_read: new Set(
      inputs.chaptersRead.map((c) => `${c.bookSlug}:${c.chapter}`)
    ).size,
    verses_bookmarked: inputs.bookmarks.length,
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
    journey_days: new Set(inputs.journeyEvents.map((e) => e.dateKey)).size,
  };
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
