import { hashString, seededRandom } from "@/lib/utils/dates";
import {
  SEVEN_DAYS_TILE_IDS,
  type SevenDaysBoard,
  type SevenDaysCell,
  type SevenDaysResolution,
  type SevenDaysTileId,
} from "./types";

/** A run of three is a match; longer runs and cascades pay more. */
export const MATCH_LENGTH = 3;
const POINTS_PER_TILE = 10;
const CASCADE_BONUS = 5;

export type Rng = () => number;

/** Every board is reproducible from its seed, so a bug can be replayed. */
export function boardRng(seed: string): Rng {
  return seededRandom(hashString(seed));
}

function emptyTally(): Record<SevenDaysTileId, number> {
  return {
    light: 0,
    waters: 0,
    land: 0,
    seed: 0,
    wing: 0,
  };
}

/** A fresh counter for goals and cascades; exported so callers never share one. */
export function tileTally(): Record<SevenDaysTileId, number> {
  return emptyTally();
}

export function indexOf(board: SevenDaysBoard, row: number, col: number): number {
  return row * board.cols + col;
}

export function rowOf(board: SevenDaysBoard, index: number): number {
  return Math.floor(index / board.cols);
}

export function colOf(board: SevenDaysBoard, index: number): number {
  return index % board.cols;
}

/** Only orthogonal neighbours may trade places — no diagonal reach. */
export function areAdjacent(
  board: SevenDaysBoard,
  a: number,
  b: number,
): boolean {
  if (a === b) return false;
  const rowDelta = Math.abs(rowOf(board, a) - rowOf(board, b));
  const colDelta = Math.abs(colOf(board, a) - colOf(board, b));
  return rowDelta + colDelta === 1;
}

export function swapCells(
  board: SevenDaysBoard,
  a: number,
  b: number,
): SevenDaysBoard {
  const cells = [...board.cells];
  [cells[a], cells[b]] = [cells[b], cells[a]];
  return { ...board, cells };
}

/**
 * Collects every cell inside a horizontal or vertical run of three or more.
 * Runs that cross share their intersection, which is why this returns a set
 * rather than a list of runs.
 */
export function findMatches(board: SevenDaysBoard): Set<number> {
  const matched = new Set<number>();

  const sweep = (
    outer: number,
    inner: number,
    at: (o: number, i: number) => number,
  ) => {
    for (let o = 0; o < outer; o += 1) {
      let runStart = 0;
      for (let i = 1; i <= inner; i += 1) {
        const previous = board.cells[at(o, i - 1)];
        const current = i < inner ? board.cells[at(o, i)] : null;
        if (current !== null && current === previous) continue;
        const length = i - runStart;
        if (previous !== null && length >= MATCH_LENGTH) {
          for (let k = runStart; k < i; k += 1) matched.add(at(o, k));
        }
        runStart = i;
      }
    }
  };

  sweep(board.rows, board.cols, (row, col) => indexOf(board, row, col));
  sweep(board.cols, board.rows, (col, row) => indexOf(board, row, col));
  return matched;
}

/** Drops surviving tiles into the gaps and seeds new ones along the top. */
function settle(
  board: SevenDaysBoard,
  tiles: readonly SevenDaysTileId[],
  random: Rng,
): SevenDaysBoard {
  const cells: SevenDaysCell[] = [...board.cells];
  for (let col = 0; col < board.cols; col += 1) {
    let write = board.rows - 1;
    for (let row = board.rows - 1; row >= 0; row -= 1) {
      const cell = cells[indexOf(board, row, col)];
      if (cell === null) continue;
      cells[indexOf(board, write, col)] = cell;
      write -= 1;
    }
    for (let row = write; row >= 0; row -= 1) {
      cells[indexOf(board, row, col)] = tiles[Math.floor(random() * tiles.length)];
    }
  }
  return { ...board, cells };
}

/**
 * Clears matches, lets the board fall, and repeats while the fall creates more
 * matches. Returns what was gathered so the caller can score a whole cascade
 * as one move.
 */
export function resolveMatches(
  board: SevenDaysBoard,
  tiles: readonly SevenDaysTileId[],
  random: Rng,
): SevenDaysResolution {
  const cleared = emptyTally();
  let current = board;
  let cascades = 0;
  let points = 0;

  for (;;) {
    const matched = findMatches(current);
    if (matched.size === 0) break;
    cascades += 1;
    const cells: SevenDaysCell[] = [...current.cells];
    for (const index of matched) {
      const tile = cells[index];
      if (tile) cleared[tile] += 1;
      cells[index] = null;
    }
    points += matched.size * POINTS_PER_TILE + (cascades - 1) * CASCADE_BONUS;
    current = settle({ ...current, cells }, tiles, random);
  }

  return { board: current, cleared, cascades, points };
}

/** True when some adjacent trade would create a run — used to avoid dead boards. */
export function hasAvailableMove(board: SevenDaysBoard): boolean {
  for (let row = 0; row < board.rows; row += 1) {
    for (let col = 0; col < board.cols; col += 1) {
      const index = indexOf(board, row, col);
      if (col + 1 < board.cols) {
        const right = indexOf(board, row, col + 1);
        if (findMatches(swapCells(board, index, right)).size > 0) return true;
      }
      if (row + 1 < board.rows) {
        const down = indexOf(board, row + 1, col);
        if (findMatches(swapCells(board, index, down)).size > 0) return true;
      }
    }
  }
  return false;
}

/**
 * Places tiles one at a time, refusing any tile that would complete a run with
 * the two already to its left or above. On a seven-by-seven board a random
 * fill lands a free match about ninety-nine times in a hundred, so building
 * the board match-free is the difference between one pass and a reject loop.
 */
function fillWithoutMatches(
  rows: number,
  cols: number,
  tiles: readonly SevenDaysTileId[],
  random: Rng,
): SevenDaysBoard {
  const cells: SevenDaysCell[] = new Array(rows * cols).fill(null);
  const at = (row: number, col: number) => row * cols + col;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const banned = new Set<SevenDaysCell>();
      if (col >= 2 && cells[at(row, col - 1)] === cells[at(row, col - 2)]) {
        banned.add(cells[at(row, col - 1)]);
      }
      if (row >= 2 && cells[at(row - 1, col)] === cells[at(row - 2, col)]) {
        banned.add(cells[at(row - 1, col)]);
      }
      // At most two tiles can be banned, so four kinds always leave a choice.
      const choices = tiles.filter((tile) => !banned.has(tile));
      cells[at(row, col)] = choices[Math.floor(random() * choices.length)];
    }
  }
  return { rows, cols, cells };
}

/**
 * Opens a board that is already at rest and still has something to do: no free
 * matches handed to the player, and never a dead board they cannot move on.
 */
export function createBoard(
  rows: number,
  cols: number,
  tiles: readonly SevenDaysTileId[],
  random: Rng,
): SevenDaysBoard {
  let candidate = fillWithoutMatches(rows, cols, tiles, random);
  for (let attempt = 0; attempt < 40 && !hasAvailableMove(candidate); attempt += 1) {
    candidate = fillWithoutMatches(rows, cols, tiles, random);
  }
  return candidate;
}

/**
 * Rearranges the tiles already on the board when no move remains. Nothing is
 * added or removed, so a stalled board never costs the player what they had
 * already gathered — the shuffle repairs accidental runs by trading two cells
 * rather than by dealing a fresh board.
 */
export function reshuffleBoard(
  board: SevenDaysBoard,
  tiles: readonly SevenDaysTileId[],
  random: Rng,
): SevenDaysBoard {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const cells = [...board.cells];
    for (let index = cells.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [cells[index], cells[target]] = [cells[target], cells[index]];
    }
    let candidate: SevenDaysBoard = { ...board, cells };
    for (let repair = 0; repair < 200; repair += 1) {
      const matched = findMatches(candidate);
      if (matched.size === 0) break;
      const offenders = [...matched];
      const from = offenders[Math.floor(random() * offenders.length)];
      const to = Math.floor(random() * candidate.cells.length);
      if (candidate.cells[from] === candidate.cells[to]) continue;
      candidate = swapCells(candidate, from, to);
    }
    if (findMatches(candidate).size > 0) continue;
    if (!hasAvailableMove(candidate)) continue;
    return candidate;
  }
  // Unreachable for any real board; a fresh deal still beats a stuck one.
  return createBoard(board.rows, board.cols, tiles, random);
}

/** Guards content and storage against a tile id that is no longer in the set. */
export function isSevenDaysTileId(value: unknown): value is SevenDaysTileId {
  return (
    typeof value === "string" &&
    (SEVEN_DAYS_TILE_IDS as readonly string[]).includes(value)
  );
}
