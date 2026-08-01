import {
  SEVEN_DAYS_CHAPTERS,
  SEVEN_DAYS_LEVELS_PER_CHAPTER,
  SEVEN_DAYS_TOTAL_LEVELS,
} from "./content";
import {
  SEVEN_DAYS_TILE_IDS,
  type SevenDaysChapter,
  type SevenDaysGoal,
  type SevenDaysLevel,
  type SevenDaysTileId,
} from "./types";

/** Seven rows and seven columns — the board is the week it retells. */
export const BOARD_ROWS = 7;
export const BOARD_COLS = 7;

/** Four kinds early keeps matches plentiful; the fifth arrives once the
 *  reader has the rhythm, and makes every later board a little sparser. */
const FOUR_TILE_CHAPTERS = 3;

const BASE_MOVES = 32;
const BASE_GOAL = 10;

function tilesForChapter(chapter: SevenDaysChapter): SevenDaysTileId[] {
  const all = [...SEVEN_DAYS_TILE_IDS];
  if (chapter.day > FOUR_TILE_CHAPTERS) return all;
  // Keep the day's own signature on the board and drop one of the others, so
  // the first three days always have something to gather that belongs to them.
  const rest = all.filter((tile) => tile !== chapter.signature);
  return [chapter.signature, ...rest.slice(0, 3)];
}

/**
 * The tile a level asks for walks through the day's palette rather than
 * repeating the signature seven times — the same board keeps feeling new, and
 * the day's own tile still opens and closes the chapter.
 */
function goalTile(
  chapter: SevenDaysChapter,
  levelIndex: number,
  tiles: readonly SevenDaysTileId[],
): SevenDaysTileId {
  if (levelIndex === 0 || levelIndex === SEVEN_DAYS_LEVELS_PER_CHAPTER - 1) {
    return chapter.signature;
  }
  const others = tiles.filter((tile) => tile !== chapter.signature);
  return others[(levelIndex - 1) % others.length];
}

function goalsFor(
  chapter: SevenDaysChapter,
  levelIndex: number,
  tiles: readonly SevenDaysTileId[],
): SevenDaysGoal[] {
  const primary = goalTile(chapter, levelIndex, tiles);
  const count = BASE_GOAL + (chapter.day - 1) + levelIndex * 2;
  const goals: SevenDaysGoal[] = [{ tile: primary, count }];
  // A second goal from the fourth level on: enough to ask for attention on two
  // parts of the board without turning a quiet game into bookkeeping.
  if (levelIndex >= 3) {
    const secondary =
      tiles.filter((tile) => tile !== primary)[levelIndex % (tiles.length - 1)];
    goals.push({ tile: secondary, count: Math.max(6, Math.round(count * 0.6)) });
  }
  return goals;
}

/** Builds one level's rules. Pure, so the curve can be inspected in a test. */
export function buildLevel(
  chapter: SevenDaysChapter,
  levelIndex: number,
): SevenDaysLevel {
  const tiles = tilesForChapter(chapter);
  return {
    id: `${chapter.id}-level-${levelIndex + 1}`,
    chapterId: chapter.id,
    day: chapter.day,
    level: levelIndex + 1,
    moves: BASE_MOVES - (chapter.day - 1) - levelIndex,
    goals: goalsFor(chapter, levelIndex, tiles),
    tiles,
  };
}

/** All forty-nine levels in play order, built once. */
export const SEVEN_DAYS_LEVELS: readonly SevenDaysLevel[] =
  SEVEN_DAYS_CHAPTERS.flatMap((chapter) =>
    Array.from({ length: SEVEN_DAYS_LEVELS_PER_CHAPTER }, (_, index) =>
      buildLevel(chapter, index),
    ),
  );

export const SEVEN_DAYS_LEVEL_BY_ID = new Map(
  SEVEN_DAYS_LEVELS.map((level) => [level.id, level]),
);

/** Position in the single 0…48 run that unlocking walks along. */
export function levelOrdinal(level: SevenDaysLevel): number {
  return (level.day - 1) * SEVEN_DAYS_LEVELS_PER_CHAPTER + (level.level - 1);
}

export function levelAtOrdinal(ordinal: number): SevenDaysLevel | null {
  if (!Number.isInteger(ordinal) || ordinal < 0) return null;
  return SEVEN_DAYS_LEVELS[ordinal] ?? null;
}

export function chapterById(id: string): SevenDaysChapter | undefined {
  return SEVEN_DAYS_CHAPTERS.find((chapter) => chapter.id === id);
}

/** The question a level ends with — one per level, in level order. */
export function questionForLevel(level: SevenDaysLevel) {
  const chapter = chapterById(level.chapterId);
  return chapter?.questions[level.level - 1];
}

export { SEVEN_DAYS_TOTAL_LEVELS };
