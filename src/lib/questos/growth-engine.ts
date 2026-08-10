/**
 * Growth engine — converts meaningful actions into the living tree.
 *
 * Rules (Codex, Volume VI §11):
 *  - Growth never decays. Absence is never punished.
 *  - Stages are presented visually, not numerically.
 */
import {
  GROWTH_TYPES,
  MEANINGFUL_JOURNEY_EVENT_TYPES,
  type GrowthEvent,
  type GrowthTreeState,
  type GrowthType,
  type TreeStage,
} from "./types";
import { treeStageLabels } from "./copy";
import { isValidZonedTimestamp } from "@/lib/utils/dates";

const DAY_MS = 86_400_000;
const GROWTH_TYPE_SET = new Set<string>(GROWTH_TYPES);
const GROWTH_SOURCE_TYPE_SET = new Set<string>(MEANINGFUL_JOURNEY_EVENT_TYPES);

export interface RecentGrowthSummary {
  totalSteps: number;
  activeDays: number;
  activeGrowthTypes: GrowthType[];
}

/** Accept only complete ledger entries that the app can safely aggregate. */
export function isValidGrowthEvent(value: unknown): value is GrowthEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    event.id.length > 0 &&
    typeof event.growthType === "string" &&
    GROWTH_TYPE_SET.has(event.growthType) &&
    Number.isSafeInteger(event.amount) &&
    (event.amount as number) > 0 &&
    typeof event.sourceType === "string" &&
    GROWTH_SOURCE_TYPE_SET.has(event.sourceType) &&
    isValidZonedTimestamp(event.occurredAt)
  );
}

/** Keep the first complete occurrence of each append-only event id. */
export function uniqueValidGrowthEvents(events: readonly unknown[]): GrowthEvent[] {
  const seen = new Set<string>();
  const valid: GrowthEvent[] = [];
  for (const event of events) {
    if (!isValidGrowthEvent(event) || seen.has(event.id)) continue;
    seen.add(event.id);
    valid.push(event);
  }
  return valid;
}

/** Project an instant onto the user's calendar before comparing recap days. */
function calendarDay(
  value: string,
  timeZone?: string
): number | null {
  if (!isValidZonedTimestamp(value)) return null;
  const date = new Date(value);

  if (!timeZone) {
    return dateKeyDay(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`
    );
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    return year && month && day ? dateKeyDay(`${year}-${month}-${day}`) : null;
  } catch {
    return null;
  }
}

/** Convert YYYY-MM-DD to a UTC day number without accepting calendar rollover. */
function dateKeyDay(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(timestamp / DAY_MS);
}

/**
 * Summarize the seven user-calendar days ending at `throughDateKey`.
 * The recap describes presence and variety without assigning a virtue score.
 */
export function summarizeRecentGrowth(
  events: readonly GrowthEvent[],
  throughDateKey: string,
  timeZone?: string
): RecentGrowthSummary {
  const endDay = dateKeyDay(throughDateKey);
  if (endDay === null) {
    return { totalSteps: 0, activeDays: 0, activeGrowthTypes: [] };
  }

  const activeDays = new Set<number>();
  const activeTypes = new Set<GrowthType>();
  let totalSteps = 0;
  for (const event of uniqueValidGrowthEvents(events)) {
    const day = calendarDay(event.occurredAt, timeZone);
    if (day === null || day < endDay - 6 || day > endDay) continue;
    totalSteps += event.amount;
    activeDays.add(day);
    activeTypes.add(event.growthType);
  }

  return {
    totalSteps,
    activeDays: activeDays.size,
    activeGrowthTypes: GROWTH_TYPES.filter((type) => activeTypes.has(type)),
  };
}

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

/** Derive the lifetime tree from unique, complete, positive growth records. */
export function calculateTreeState(
  events: readonly GrowthEvent[]
): GrowthTreeState {
  const byType: Record<GrowthType, number> = {
    roots: 0,
    branches: 0,
    leaves: 0,
    fruit: 0,
    sunlight: 0,
    flowers: 0,
  };
  let total = 0;
  for (const event of uniqueValidGrowthEvents(events)) {
    byType[event.growthType] += event.amount;
    total += event.amount;
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
