/**
 * Growth engine — converts meaningful actions into the living tree.
 *
 * Rules (Codex, Volume VI §11):
 *  - Growth never decays. Absence is never punished.
 *  - Stages are presented visually, not numerically.
 */
import type {
  GrowthEvent,
  GrowthTreeState,
  GrowthType,
  TreeStage,
} from "./types";
import { treeStageLabels } from "./copy";

const STAGE_THRESHOLDS: Array<{ stage: TreeStage; min: number }> = [
  { stage: "sheltering", min: 250 },
  { stage: "fruit-bearing", min: 100 },
  { stage: "growing", min: 40 },
  { stage: "young", min: 15 },
  { stage: "sprout", min: 5 },
  { stage: "seed", min: 0 },
];

const NEXT_STAGE_MIN: Partial<Record<TreeStage, number>> = {
  seed: 5,
  sprout: 15,
  young: 40,
  growing: 100,
  "fruit-bearing": 250,
};

export function calculateTreeState(events: GrowthEvent[]): GrowthTreeState {
  const byType: Record<GrowthType, number> = {
    roots: 0,
    branches: 0,
    leaves: 0,
    fruit: 0,
    sunlight: 0,
    flowers: 0,
  };
  let total = 0;
  for (const e of events) {
    byType[e.growthType] += e.amount;
    total += e.amount;
  }
  const { stage } = STAGE_THRESHOLDS.find((s) => total >= s.min)!;
  const nextMin = NEXT_STAGE_MIN[stage];
  return {
    stage,
    stageLabel: treeStageLabels[stage],
    totalActions: total,
    toNextStage: nextMin != null ? nextMin - total : null,
    byType,
  };
}

const STAGE_FLOOR: Record<TreeStage, number> = {
  seed: 0,
  sprout: 5,
  young: 15,
  growing: 40,
  "fruit-bearing": 100,
  sheltering: 250,
};

/**
 * Progress through the current stage, for the journey's gentle progression
 * bar. Returns null at the final stage (the bar simply rests full).
 * Presented as "steps", never as points/XP (Codex: no score energy).
 */
export function stageProgress(
  state: GrowthTreeState
): { done: number; needed: number; fraction: number } | null {
  if (state.toNextStage == null) return null;
  const floor = STAGE_FLOOR[state.stage];
  const nextMin = state.totalActions + state.toNextStage;
  const needed = nextMin - floor;
  const done = state.totalActions - floor;
  return {
    done,
    needed,
    fraction: needed > 0 ? Math.min(1, Math.max(0, done / needed)) : 1,
  };
}

/** What each growth type nourishes, for gentle UI explanations. */
export const GROWTH_MEANINGS: Record<GrowthType, string> = {
  roots: "Prayer nourishes the roots",
  branches: "Scripture grows the branches",
  leaves: "Kindness grows the leaves",
  fruit: "Service bears fruit",
  sunlight: "Reflection brings sunlight",
  flowers: "Gratitude brings flowers",
};
