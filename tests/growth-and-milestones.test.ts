import { describe, expect, it } from "vitest";
import { seedMilestones } from "@/data/seed/milestones";
import {
  calculateTreeState,
  nextTreeStage,
  stageProgress,
  TREE_STAGE_DEFINITIONS,
} from "@/lib/questos/growth-engine";
import { computeMetrics } from "@/lib/questos/milestone-engine";
import type {
  GrowthEvent,
  MilestoneMetric,
  QuestCategory,
  QuestCompletion,
  QuestTemplate,
} from "@/lib/questos/types";

const EXPECTED_STAGE_MINS = [
  0, 1, 3, 5, 8, 12, 17, 23, 30, 38, 47, 58, 70, 84, 100, 120, 145,
  175, 210, 250,
];

function growthEvent(amount: number, id = `growth-${amount}`): GrowthEvent {
  return {
    id,
    growthType: "roots",
    amount,
    sourceType: "quest_completed",
    occurredAt: "2026-07-17T12:00:00.000Z",
  };
}

describe("living tree progression", () => {
  it("defines twenty ordered, named stages through the established 250-action canopy", () => {
    expect(TREE_STAGE_DEFINITIONS).toHaveLength(20);
    expect(TREE_STAGE_DEFINITIONS.map(({ min }) => min)).toEqual(
      EXPECTED_STAGE_MINS
    );
    expect(
      new Set(TREE_STAGE_DEFINITIONS.map(({ stage }) => stage)).size
    ).toBe(20);

    for (let index = 0; index < TREE_STAGE_DEFINITIONS.length; index += 1) {
      const current = TREE_STAGE_DEFINITIONS[index];
      const next = TREE_STAGE_DEFINITIONS[index + 1];
      expect(nextTreeStage(current.stage)).toBe(next?.stage ?? null);
    }
  });

  it("changes stage exactly at each threshold and reports local-stage progress", () => {
    for (let index = 0; index < TREE_STAGE_DEFINITIONS.length; index += 1) {
      const current = TREE_STAGE_DEFINITIONS[index];
      const next = TREE_STAGE_DEFINITIONS[index + 1];
      const state = calculateTreeState([growthEvent(current.min)]);
      expect(state.stage, `threshold ${current.min}`).toBe(current.stage);
      expect(state.stageLabel, current.stage).not.toBe("");

      const progress = stageProgress(state);
      if (!next) {
        expect(state.toNextStage).toBeNull();
        expect(progress).toBeNull();
        continue;
      }

      expect(state.toNextStage).toBe(next.min - current.min);
      expect(progress).toEqual({
        done: 0,
        needed: next.min - current.min,
        fraction: 0,
      });

      const beforeNext = calculateTreeState([growthEvent(next.min - 1)]);
      expect(beforeNext.stage).toBe(current.stage);
      expect(beforeNext.toNextStage).toBe(1);
    }
  });

  it("never lets malformed negative or non-finite imports shrink growth", () => {
    const state = calculateTreeState([
      growthEvent(-10, "negative"),
      growthEvent(Number.NaN, "nan"),
      growthEvent(Number.POSITIVE_INFINITY, "infinite"),
      growthEvent(2, "valid"),
    ]);

    expect(state.totalActions).toBe(2);
    expect(state.byType.roots).toBe(2);
    expect(state.stage).toBe("stirring-seed");
  });
});

describe("expanded milestone catalogue", () => {
  it("keeps at least thirty distinct, achievable pilgrimage markers", () => {
    expect(seedMilestones.length).toBeGreaterThanOrEqual(30);
    expect(new Set(seedMilestones.map(({ key }) => key)).size).toBe(
      seedMilestones.length
    );
    for (const milestone of seedMilestones) {
      expect(milestone.title, milestone.key).not.toBe("");
      expect(milestone.description, milestone.key).not.toBe("");
      expect(milestone.requirementCount, milestone.key).toBeGreaterThan(0);
    }
  });

  it("counts every quest category used by the new milestones", () => {
    const categories: QuestCategory[] = [
      "forgiveness",
      "generosity",
      "discipline",
      "worship",
      "reflection",
      "patience",
    ];
    const questBySlug = new Map<string, QuestTemplate>(
      categories.map((category) => [
        category,
        { slug: category, category } as QuestTemplate,
      ])
    );
    const completions: QuestCompletion[] = categories.map((questSlug) => ({
      id: `completion-${questSlug}`,
      questSlug,
      dateKey: "2026-07-17",
      completedAt: "2026-07-17T12:00:00.000Z",
    }));
    const metrics = computeMetrics({
      completions,
      prayers: [],
      reflections: [],
      chaptersRead: [],
      bookmarks: [],
      journeyEvents: [],
      questBySlug,
    });

    for (const category of categories) {
      const metric = `quests_${category}` as MilestoneMetric;
      expect(metrics[metric], metric).toBe(1);
      expect(
        seedMilestones.some(
          (milestone) => milestone.requirementMetric === metric
        ),
        `${metric} needs a milestone`
      ).toBe(true);
    }
  });
});
