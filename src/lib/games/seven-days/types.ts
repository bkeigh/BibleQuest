import type { ScriptureSource } from "@/lib/games/types";

/**
 * Five created things a player gathers. Named for what Genesis 1 makes rather
 * than for a colour, so the board reads as the story it retells.
 */
export const SEVEN_DAYS_TILE_IDS = [
  "light",
  "waters",
  "land",
  "seed",
  "wing",
] as const;

export type SevenDaysTileId = (typeof SEVEN_DAYS_TILE_IDS)[number];

/**
 * A cell holds a tile, is empty mid-cascade (`null`), or is not part of this
 * level's board at all (`"blocked"`). Blocked cells are what give each level
 * its own shape: tiles never occupy them, fall through them, or refill them.
 */
export const BLOCKED = "blocked" as const;
export type SevenDaysCell = SevenDaysTileId | null | typeof BLOCKED;

export interface SevenDaysBoard {
  readonly rows: number;
  readonly cols: number;
  /** Row-major cells: index = row * cols + col. */
  readonly cells: readonly SevenDaysCell[];
}

/**
 * A level's shape, drawn as text so it can be read at a glance in source.
 * `#` is playable, anything else is cut away.
 */
export type SevenDaysMask = readonly string[];

export interface SevenDaysGoal {
  readonly tile: SevenDaysTileId;
  readonly count: number;
}

export interface SevenDaysLevel {
  /** `day-3-level-5` — stable, and readable in storage. */
  readonly id: string;
  readonly chapterId: string;
  /** 1-based, for the reader. */
  readonly day: number;
  readonly level: number;
  readonly moves: number;
  readonly goals: readonly SevenDaysGoal[];
  /** Which of the five tiles appear on this board. */
  readonly tiles: readonly SevenDaysTileId[];
  /** The board's shape. Every level in a day gets a different one. */
  readonly mask: SevenDaysMask;
  /** The scene this level is played over, by wallpaper catalogue id. */
  readonly sceneId: string;
}

export interface SevenDaysQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly [string, string, string];
  readonly answerIndex: 0 | 1 | 2;
  readonly explanation: string;
  readonly source: ScriptureSource;
}

export interface SevenDaysChapter {
  readonly id: string;
  /** 1–7, the day of creation this chapter retells. */
  readonly day: number;
  readonly title: string;
  readonly summary: string;
  /** The tile this day brings into the world; the first level gathers it. */
  readonly signature: SevenDaysTileId;
  readonly source: ScriptureSource;
  /** One question per level, in level order. */
  readonly questions: readonly SevenDaysQuestion[];
}

/** What a resolved swap produced, for scoring and goal tracking. */
export interface SevenDaysResolution {
  readonly board: SevenDaysBoard;
  /** How many of each tile the cascade cleared. */
  readonly cleared: Readonly<Record<SevenDaysTileId, number>>;
  /** 1 for a plain match; higher when clears fell into further matches. */
  readonly cascades: number;
  readonly points: number;
}

export type SevenDaysLevelStatus = "playing" | "cleared" | "out-of-moves";

export interface SevenDaysLevelState {
  readonly level: SevenDaysLevel;
  readonly board: SevenDaysBoard;
  readonly movesLeft: number;
  readonly gathered: Readonly<Record<SevenDaysTileId, number>>;
  readonly points: number;
  readonly status: SevenDaysLevelStatus;
  /** Set while a swap is being resolved so input cannot outrun the animation. */
  readonly selected: number | null;
}
