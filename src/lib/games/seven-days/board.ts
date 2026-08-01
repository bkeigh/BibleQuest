import { hashString, seededRandom } from "@/lib/utils/dates";
import {
  BLOCKED,
  SEVEN_DAYS_TILE_IDS,
  type SevenDaysBoard,
  type SevenDaysCell,
  type SevenDaysMask,
  type SevenDaysResolution,
  type SevenDaysStep,
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

/** True for a cell that is not part of this level's shape. */
export function isBlocked(board: SevenDaysBoard, index: number): boolean {
  return board.cells[index] === BLOCKED;
}

/**
 * Only orthogonal neighbours may trade places — no diagonal reach, and never
 * across a cell the level cut away.
 */
export function areAdjacent(
  board: SevenDaysBoard,
  a: number,
  b: number,
): boolean {
  if (a === b) return false;
  if (isBlocked(board, a) || isBlocked(board, b)) return false;
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
 * rather than a list of runs. A blocked cell breaks a run: two tiles either
 * side of a gap are not three in a row.
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
        const playable = previous !== null && previous !== BLOCKED;
        if (playable && current === previous) continue;
        const length = i - runStart;
        if (playable && length >= MATCH_LENGTH) {
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

/**
 * Drops surviving tiles into the gaps and seeds new ones at the top.
 *
 * A blocked cell is a floor as well as a wall: tiles stack on top of it rather
 * than falling past, and each unbroken stretch of open cells in a column
 * refills from its own top. Without that, a board with a hole in the middle
 * would drain through it.
 */
export function settleBoard(
  board: SevenDaysBoard,
  tiles: readonly SevenDaysTileId[],
  random: Rng,
): SevenDaysBoard {
  const cells: SevenDaysCell[] = [...board.cells];
  for (let col = 0; col < board.cols; col += 1) {
    let segmentBottom = board.rows - 1;
    for (let row = board.rows - 1; row >= -1; row -= 1) {
      const blocked = row < 0 || cells[indexOf(board, row, col)] === BLOCKED;
      if (!blocked) continue;
      // Compact the open run between this wall and the previous one.
      let write = segmentBottom;
      for (let read = segmentBottom; read > row; read -= 1) {
        const cell = cells[indexOf(board, read, col)];
        if (cell === null) continue;
        cells[indexOf(board, write, col)] = cell;
        write -= 1;
      }
      for (let fill = write; fill > row; fill -= 1) {
        cells[indexOf(board, fill, col)] =
          tiles[Math.floor(random() * tiles.length)];
      }
      segmentBottom = row - 1;
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
  const steps: SevenDaysStep[] = [];

  for (;;) {
    const matched = findMatches(current);
    if (matched.size === 0) break;
    cascades += 1;
    const cells: SevenDaysCell[] = [...current.cells];
    for (const index of matched) {
      const tile = cells[index];
      if (tile && tile !== BLOCKED) cleared[tile] += 1;
      cells[index] = null;
    }
    // The board with holes in it, before anything falls. A surface that only
    // ever sees the settled result cannot show the reader what they matched —
    // tiles would vanish and reappear elsewhere in the same frame.
    const emptied: SevenDaysBoard = { ...current, cells };
    points += matched.size * POINTS_PER_TILE + (cascades - 1) * CASCADE_BONUS;
    current = settleBoard(emptied, tiles, random);
    steps.push({ cascade: cascades, matched, emptied, settled: current });
  }

  return { board: current, cleared, cascades, points, steps };
}

/** True when some adjacent trade would create a run — used to avoid dead boards. */
export function hasAvailableMove(board: SevenDaysBoard): boolean {
  for (let row = 0; row < board.rows; row += 1) {
    for (let col = 0; col < board.cols; col += 1) {
      const index = indexOf(board, row, col);
      if (isBlocked(board, index)) continue;
      if (col + 1 < board.cols) {
        const right = indexOf(board, row, col + 1);
        if (
          !isBlocked(board, right) &&
          findMatches(swapCells(board, index, right)).size > 0
        ) {
          return true;
        }
      }
      if (row + 1 < board.rows) {
        const down = indexOf(board, row + 1, col);
        if (
          !isBlocked(board, down) &&
          findMatches(swapCells(board, index, down)).size > 0
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Reads a text mask into the blocked/open skeleton of a board. */
export function maskToBoard(mask: SevenDaysMask): SevenDaysBoard {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;
  const cells: SevenDaysCell[] = [];
  for (const line of mask) {
    for (let col = 0; col < cols; col += 1) {
      cells.push(line[col] === "#" ? null : BLOCKED);
    }
  }
  return { rows, cols, cells };
}

/** How many cells a shape actually plays on. */
export function playableCount(board: SevenDaysBoard): number {
  return board.cells.reduce<number>(
    (total, cell) => (cell === BLOCKED ? total : total + 1),
    0,
  );
}

/**
 * Places tiles one at a time, refusing any tile that would complete a run with
 * the two already to its left or above. On a seven-by-seven board a random
 * fill lands a free match about ninety-nine times in a hundred, so building
 * the board match-free is the difference between one pass and a reject loop.
 */
function fillWithoutMatches(
  skeleton: SevenDaysBoard,
  tiles: readonly SevenDaysTileId[],
  random: Rng,
): SevenDaysBoard {
  const { rows, cols } = skeleton;
  const cells: SevenDaysCell[] = [...skeleton.cells];
  const at = (row: number, col: number) => row * cols + col;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (cells[at(row, col)] === BLOCKED) continue;
      const banned = new Set<SevenDaysCell>();
      if (
        col >= 2 &&
        cells[at(row, col - 1)] !== BLOCKED &&
        cells[at(row, col - 1)] === cells[at(row, col - 2)]
      ) {
        banned.add(cells[at(row, col - 1)]);
      }
      if (
        row >= 2 &&
        cells[at(row - 1, col)] !== BLOCKED &&
        cells[at(row - 1, col)] === cells[at(row - 2, col)]
      ) {
        banned.add(cells[at(row - 1, col)]);
      }
      // At most two tiles can be banned, so four kinds always leave a choice.
      const choices = tiles.filter((tile) => !banned.has(tile));
      cells[at(row, col)] = choices[Math.floor(random() * choices.length)];
    }
  }
  return { ...skeleton, cells };
}

/**
 * Opens a board that is already at rest and still has something to do: no free
 * matches handed to the player, and never a dead board they cannot move on.
 */
export function createBoard(
  mask: SevenDaysMask,
  tiles: readonly SevenDaysTileId[],
  random: Rng,
): SevenDaysBoard {
  const skeleton = maskToBoard(mask);
  let candidate = fillWithoutMatches(skeleton, tiles, random);
  for (let attempt = 0; attempt < 40 && !hasAvailableMove(candidate); attempt += 1) {
    candidate = fillWithoutMatches(skeleton, tiles, random);
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
  const open = board.cells
    .map((cell, index) => ({ cell, index }))
    .filter((entry) => entry.cell !== BLOCKED);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const pool = open.map((entry) => entry.cell);
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [pool[index], pool[target]] = [pool[target], pool[index]];
    }
    const cells = [...board.cells];
    open.forEach((entry, position) => {
      cells[entry.index] = pool[position];
    });
    let candidate: SevenDaysBoard = { ...board, cells };
    for (let repair = 0; repair < 200; repair += 1) {
      const matched = findMatches(candidate);
      if (matched.size === 0) break;
      const offenders = [...matched];
      const from = offenders[Math.floor(random() * offenders.length)];
      const to = open[Math.floor(random() * open.length)].index;
      if (candidate.cells[from] === candidate.cells[to]) continue;
      candidate = swapCells(candidate, from, to);
    }
    if (findMatches(candidate).size > 0) continue;
    if (!hasAvailableMove(candidate)) continue;
    return candidate;
  }
  // Unreachable for any real board; a fresh deal still beats a stuck one.
  return createBoard(
    Array.from({ length: board.rows }, (_, row) =>
      Array.from({ length: board.cols }, (_, col) =>
        board.cells[row * board.cols + col] === BLOCKED ? "." : "#",
      ).join(""),
    ),
    tiles,
    random,
  );
}

/** Guards content and storage against a tile id that is no longer in the set. */
export function isSevenDaysTileId(value: unknown): value is SevenDaysTileId {
  return (
    typeof value === "string" &&
    (SEVEN_DAYS_TILE_IDS as readonly string[]).includes(value)
  );
}
