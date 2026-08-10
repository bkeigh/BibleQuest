import {
  FREE_RHYTHM_BLOCK_LIMIT,
  PLUS_RHYTHM_BLOCK_LIMIT,
  RHYTHM_DAYS,
  RHYTHM_PRACTICES,
  type RhythmBlock,
  type RhythmDay,
  type RhythmPractice,
  type RhythmState,
} from "./types";

const CLOCK = /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const MAX_LABEL_LENGTH = 40;
const DAY_SET = new Set<number>(RHYTHM_DAYS);
const PRACTICE_SET = new Set<string>(RHYTHM_PRACTICES);

/** Accepts only complete zoned instants rather than browser-normalized dates. */
function validInstant(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

/** Removes duplicates while preserving the user-facing practice order. */
export function normalizePractices(
  practices: readonly RhythmPractice[],
): RhythmPractice[] {
  const selected = new Set(practices);
  return RHYTHM_PRACTICES.filter((practice) => selected.has(practice));
}

/** Removes duplicate weekdays and stores them in calendar order. */
export function normalizeRhythmDays(days: readonly RhythmDay[]): RhythmDay[] {
  return [...new Set(days)].sort((left, right) => left - right) as RhythmDay[];
}

/** Parses one bounded rhythm block from device storage or an import. */
export function parseRhythmBlock(value: unknown): RhythmBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const block = value as Record<string, unknown>;
  if (
    Object.keys(block).sort().join(",") !==
      [
        "createdAt",
        "days",
        "fallbackPractice",
        "id",
        "label",
        "practices",
        "time",
        "updatedAt",
      ]
        .sort()
        .join(",") ||
    typeof block.id !== "string" ||
    !ID.test(block.id) ||
    typeof block.label !== "string" ||
    block.label.trim() !== block.label ||
    block.label.length < 1 ||
    block.label.length > MAX_LABEL_LENGTH ||
    typeof block.time !== "string" ||
    !CLOCK.test(block.time) ||
    !Array.isArray(block.days) ||
    block.days.length < 1 ||
    block.days.length > RHYTHM_DAYS.length ||
    !block.days.every(
      (day) => typeof day === "number" && DAY_SET.has(day),
    ) ||
    new Set(block.days).size !== block.days.length ||
    !Array.isArray(block.practices) ||
    block.practices.length < 1 ||
    block.practices.length > RHYTHM_PRACTICES.length ||
    !block.practices.every(
      (practice) =>
        typeof practice === "string" && PRACTICE_SET.has(practice),
    ) ||
    new Set(block.practices).size !== block.practices.length ||
    !(
      block.fallbackPractice === null ||
      (typeof block.fallbackPractice === "string" &&
        PRACTICE_SET.has(block.fallbackPractice))
    ) ||
    (typeof block.fallbackPractice === "string" &&
      block.practices.includes(block.fallbackPractice)) ||
    !validInstant(block.createdAt) ||
    !validInstant(block.updatedAt) ||
    Date.parse(block.updatedAt as string) < Date.parse(block.createdAt as string)
  ) {
    return null;
  }

  const parsed = block as unknown as RhythmBlock;
  return {
    ...parsed,
    days: normalizeRhythmDays(parsed.days),
    practices: normalizePractices(parsed.practices),
  };
}

/** Rejects partial or oversized rhythm payloads instead of repairing silently. */
export function parseRhythmState(value: unknown): RhythmState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (
    Object.keys(state).sort().join(",") !== "blocks,version" ||
    state.version !== 1 ||
    !Array.isArray(state.blocks) ||
    state.blocks.length > PLUS_RHYTHM_BLOCK_LIMIT
  ) {
    return null;
  }

  const blocks = state.blocks.map(parseRhythmBlock);
  if (blocks.some((block) => block === null)) return null;
  const validBlocks = blocks as RhythmBlock[];
  if (new Set(validBlocks.map((block) => block.id)).size !== validBlocks.length) {
    return null;
  }
  return { version: 1, blocks: validBlocks };
}

/** Selects today's enabled blocks in clock order. */
export function rhythmBlocksForDate(
  state: RhythmState,
  date: Date = new Date(),
  isPlus = true,
): RhythmBlock[] {
  const day = date.getDay();
  const limit = isPlus ? PLUS_RHYTHM_BLOCK_LIMIT : FREE_RHYTHM_BLOCK_LIMIT;
  return [...state.blocks]
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit)
    .filter((block) => block.days.includes(day as RhythmDay))
    .sort(
      (left, right) =>
        left.time.localeCompare(right.time) || left.id.localeCompare(right.id),
    );
}

/** Chooses the next scheduled block, or the latest one when today's times passed. */
export function rhythmBlockForCurrentTime(
  blocks: readonly RhythmBlock[],
  localTime: string,
): RhythmBlock | null {
  const ordered = [...blocks].sort(
    (left, right) =>
      left.time.localeCompare(right.time) || left.id.localeCompare(right.id),
  );
  return (
    ordered.find((block) => block.time >= localTime) ??
    ordered.at(-1) ??
    null
  );
}
