import { describe, expect, it } from "vitest";
import { seedMilestones } from "@/data/seed/milestones";
import {
  calculateTreeState,
  nextTreeStage,
  stageProgress,
  summarizeRecentGrowth,
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

function growthEvent(
  amount: number,
  id = `growth-${amount}`,
  patch: Partial<GrowthEvent> = {}
): GrowthEvent {
  return {
    id,
    growthType: "roots",
    amount,
    sourceType: "quest_completed",
    occurredAt: "2026-07-17T12:00:00.000Z",
    ...patch,
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

  it("ignores duplicate ids, unknown types, fractional amounts, and bad timestamps", () => {
    const state = calculateTreeState([
      growthEvent(2, "kept"),
      growthEvent(40, "kept", { growthType: "fruit" }),
      growthEvent(8, "unknown", {
        growthType: "moss" as GrowthEvent["growthType"],
      }),
      growthEvent(1.5, "fractional"),
      growthEvent(9, "bad-time", { occurredAt: "not-a-timestamp" }),
    ]);

    expect(state.totalActions).toBe(2);
    expect(state.byType).toEqual({
      roots: 2,
      branches: 0,
      leaves: 0,
      fruit: 0,
      sunlight: 0,
      flowers: 0,
    });
  });

  it("rejects event types that never grow the tree", () => {
    const state = calculateTreeState([
      growthEvent(10, "bookmark-growth", {
        sourceType: "verse_bookmarked",
      }),
      growthEvent(10, "milestone-growth", {
        sourceType: "milestone_reached",
      }),
      growthEvent(1, "prayer-growth", {
        sourceType: "prayer_created",
      }),
    ]);

    expect(state.totalActions).toBe(1);
    expect(state.byType.roots).toBe(1);
  });

  it("summarizes seven inclusive UTC days without turning variety into a score", () => {
    const summary = summarizeRecentGrowth(
      [
        growthEvent(2, "roots", {
          occurredAt: "2026-07-11T00:00:00.000Z",
        }),
        growthEvent(1, "branches", {
          growthType: "branches",
          occurredAt: "2026-07-12T08:00:00.000Z",
        }),
        growthEvent(3, "flowers", {
          growthType: "flowers",
          occurredAt: "2026-07-12T20:00:00.000Z",
        }),
        growthEvent(1, "sunlight", {
          growthType: "sunlight",
          occurredAt: "2026-07-17T23:59:59.999Z",
        }),
        growthEvent(20, "roots", {
          occurredAt: "2026-07-13T12:00:00.000Z",
        }),
        growthEvent(10, "older", {
          growthType: "fruit",
          occurredAt: "2026-07-10T23:59:59.999Z",
        }),
        growthEvent(10, "future", {
          growthType: "leaves",
          occurredAt: "2026-07-18T00:00:00.000Z",
        }),
        growthEvent(9, "bad-time", { occurredAt: "not-a-timestamp" }),
      ],
      "2026-07-17",
      "UTC"
    );

    expect(summary).toEqual({
      totalSteps: 7,
      activeDays: 3,
      activeGrowthTypes: ["roots", "branches", "sunlight", "flowers"],
    });
    expect(summarizeRecentGrowth([growthEvent(1)], "2026-02-31")).toEqual({
      totalSteps: 0,
      activeDays: 0,
      activeGrowthTypes: [],
    });
  });

  it("uses the user's calendar day around timezone boundaries", () => {
    const summary = summarizeRecentGrowth(
      [
        growthEvent(8, "previous-local-day", {
          occurredAt: "2026-07-11T02:30:00.000Z",
        }),
        growthEvent(1, "first-local-day", {
          growthType: "branches",
          occurredAt: "2026-07-11T04:00:00.000Z",
        }),
        growthEvent(1, "last-local-day", {
          growthType: "fruit",
          occurredAt: "2026-07-18T02:30:00.000Z",
        }),
      ],
      "2026-07-17",
      "America/New_York"
    );

    expect(summary).toEqual({
      totalSteps: 2,
      activeDays: 2,
      activeGrowthTypes: ["branches", "fruit"],
    });
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
