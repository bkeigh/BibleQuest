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

/**
 * One ordered source of truth for the tree's twenty visible stages.
 *
 * The curve rewards the first few meaningful actions quickly, then opens into
 * a longer practice without moving the established fully-grown threshold of
 * 250 actions. Stage keys are deliberately non-numeric: the UI names what is
 * growing instead of presenting a rank.
 */
export const TREE_STAGE_DEFINITIONS: ReadonlyArray<{
  stage: TreeStage;
  min: number;
}> = [
  { stage: "seed", min: 0 },
  { stage: "stirring-seed", min: 1 },
  { stage: "first-root", min: 3 },
  { stage: "first-shoot", min: 5 },
  { stage: "sprout", min: 8 },
  { stage: "rooted-sprout", min: 12 },
  { stage: "young-sapling", min: 17 },
  { stage: "branching-sapling", min: 23 },
  { stage: "leafing-sapling", min: 30 },
  { stage: "young", min: 38 },
  { stage: "growing", min: 47 },
  { stage: "spreading", min: 58 },
  { stage: "budding", min: 70 },
  { stage: "flowering", min: 84 },
  { stage: "first-fruit", min: 100 },
  { stage: "fruit-bearing", min: 120 },
  { stage: "flourishing", min: 145 },
  { stage: "sturdy", min: 175 },
  { stage: "shade", min: 210 },
  { stage: "sheltering", min: 250 },
];

/** Return the named stage after `stage`, or null once the tree shelters. */
export function nextTreeStage(stage: TreeStage): TreeStage | null {
  const index = TREE_STAGE_DEFINITIONS.findIndex((entry) => entry.stage === stage);
  return index >= 0 ? TREE_STAGE_DEFINITIONS[index + 1]?.stage ?? null : null;
}

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
    // Import validation guarantees a number, but old/manual exports can still
    // contain negative or non-finite values. Growth never runs backwards.
    const amount = Number.isFinite(e.amount) ? Math.max(0, e.amount) : 0;
    byType[e.growthType] += amount;
    total += amount;
  }

  let stageIndex = 0;
  for (let index = 1; index < TREE_STAGE_DEFINITIONS.length; index += 1) {
    if (total < TREE_STAGE_DEFINITIONS[index].min) break;
    stageIndex = index;
  }
  const { stage } = TREE_STAGE_DEFINITIONS[stageIndex];
  const nextMin = TREE_STAGE_DEFINITIONS[stageIndex + 1]?.min;
  return {
    stage,
    stageLabel: treeStageLabels[stage],
    totalActions: total,
    toNextStage: nextMin === undefined ? null : Math.max(0, nextMin - total),
    byType,
  };
}

/**
 * Progress through the current stage, for the journey's gentle progression
 * bar. Returns null at the final stage (the bar simply rests full).
 * Presented as "steps", never as points/XP (Codex: no score energy).
 */
export function stageProgress(
  state: GrowthTreeState
): { done: number; needed: number; fraction: number } | null {
  const stageIndex = TREE_STAGE_DEFINITIONS.findIndex(
    (entry) => entry.stage === state.stage
  );
  const current = TREE_STAGE_DEFINITIONS[stageIndex];
  const next = TREE_STAGE_DEFINITIONS[stageIndex + 1];
  if (!current || !next || state.toNextStage == null) return null;
  const floor = current.min;
  const nextMin = next.min;
  const needed = nextMin - floor;
  const done = Math.min(needed, Math.max(0, state.totalActions - floor));
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
