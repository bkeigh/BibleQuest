import { WALLPAPER_CATALOG } from "@/lib/wallpapers/catalog";
import { hashString } from "@/lib/utils/dates";
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
  type SevenDaysMask,
  type SevenDaysTileId,
} from "./types";
import { versesForDay, type SevenDaysVerse } from "./verses";

/** Seven rows and seven columns — the board is the week it retells. */
export const BOARD_ROWS = 7;
export const BOARD_COLS = 7;

/** Four kinds early keeps matches plentiful; the fifth arrives once the
 *  reader has the rhythm, and makes every later board a little sparser. */
const FOUR_TILE_CHAPTERS = 3;

const BASE_MOVES = 32;
const BASE_GOAL = 10;

/**
 * One shape per level, so a day is seven boards rather than the same board
 * seven times. `#` plays, `.` is cut away — readable in source, which matters
 * because a mask with an isolated cell is unwinnable and easy to write by
 * accident. `assertValidSevenDaysContent` checks every one.
 */
const MASKS: readonly SevenDaysMask[] = [
  // 1 — the full field.
  ["#######", "#######", "#######", "#######", "#######", "#######", "#######"],
  // 2 — corners drawn in.
  [".#####.", "#######", "#######", "#######", "#######", "#######", ".#####."],
  // 3 — a diamond.
  ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
  // 4 — a cross.
  ["..###..", "..###..", "#######", "#######", "#######", "..###..", "..###.."],
  // 5 — an hourglass.
  ["#######", "#######", ".#####.", "..###..", ".#####.", "#######", "#######"],
  // 6 — stepped, like a hillside.
  ["####...", "#####..", "######.", "#######", ".######", "..#####", "...####"],
  // 7 — a ring, open at the centre.
  ["#######", "#######", "##...##", "##...##", "##...##", "#######", "#######"],
];

/** Every level plays over a different scene, cycling the catalogue. */
const SCENES = WALLPAPER_CATALOG.map((wallpaper) => wallpaper.id);

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

/**
 * Goals scale with the day and the level, and shrink with the board: a diamond
 * plays on twenty-five cells where the full field plays on forty-nine, and
 * asking the same count of both would make the cut-away shapes the hard ones
 * for no reason a player could see.
 */
function goalsFor(
  chapter: SevenDaysChapter,
  levelIndex: number,
  tiles: readonly SevenDaysTileId[],
  openCells: number,
): SevenDaysGoal[] {
  const primary = goalTile(chapter, levelIndex, tiles);
  const room = openCells / (BOARD_ROWS * BOARD_COLS);
  const base = BASE_GOAL + (chapter.day - 1) + levelIndex * 2;
  const count = Math.max(6, Math.round(base * room));
  const goals: SevenDaysGoal[] = [{ tile: primary, count }];
  // A second goal from the fourth level on: enough to ask for attention on two
  // parts of the board without turning a quiet game into bookkeeping.
  if (levelIndex >= 3) {
    const secondary =
      tiles.filter((tile) => tile !== primary)[levelIndex % (tiles.length - 1)];
    goals.push({ tile: secondary, count: Math.max(5, Math.round(count * 0.6)) });
  }
  return goals;
}

function countOpen(mask: SevenDaysMask): number {
  return mask.reduce(
    (total, line) => total + [...line].filter((cell) => cell === "#").length,
    0,
  );
}

/** Builds one level's rules. Pure, so the curve can be inspected in a test. */
export function buildLevel(
  chapter: SevenDaysChapter,
  levelIndex: number,
): SevenDaysLevel {
  const tiles = tilesForChapter(chapter);
  // Rotate the shapes by day so day two's first level is not day one's first
  // board again; every day still sees all seven.
  const mask = MASKS[(levelIndex + chapter.day - 1) % MASKS.length];
  const ordinal = (chapter.day - 1) * SEVEN_DAYS_LEVELS_PER_CHAPTER + levelIndex;
  return {
    id: `${chapter.id}-level-${levelIndex + 1}`,
    chapterId: chapter.id,
    day: chapter.day,
    level: levelIndex + 1,
    moves: BASE_MOVES - (chapter.day - 1) - levelIndex,
    goals: goalsFor(chapter, levelIndex, tiles, countOpen(mask)),
    tiles,
    mask,
    sceneId: SCENES[ordinal % SCENES.length],
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

export function levelsForChapter(chapterId: string): SevenDaysLevel[] {
  return SEVEN_DAYS_LEVELS.filter((level) => level.chapterId === chapterId);
}

/**
 * The verse printed under the board.
 *
 * Drawn from the day's own passage rather than the whole Bible, so what a
 * reader sees under a Day 3 board is Day 3's ground and seed. Seeded by level
 * id, so the same level always shows the same verse — a line you can come back
 * to, which is the point of being able to save it.
 */
export function verseForLevel(level: SevenDaysLevel): SevenDaysVerse | null {
  const chapter = chapterById(level.chapterId);
  if (!chapter) return null;
  const pool = versesForDay(
    chapter.source.chapter,
    chapter.source.verseStart,
    chapter.source.verseEnd ?? chapter.source.verseStart,
  );
  if (pool.length === 0) return null;
  return pool[hashString(level.id) % pool.length];
}

export { SEVEN_DAYS_TOTAL_LEVELS };
