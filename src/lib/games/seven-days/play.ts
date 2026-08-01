import {
  areAdjacent,
  boardRng,
  createBoard,
  findMatches,
  hasAvailableMove,
  reshuffleBoard,
  resolveMatches,
  swapCells,
  tileTally,
  type Rng,
} from "./board";
import { BOARD_COLS, BOARD_ROWS } from "./levels";
import type {
  SevenDaysLevel,
  SevenDaysLevelState,
  SevenDaysTileId,
} from "./types";

export interface SevenDaysSession {
  readonly state: SevenDaysLevelState;
  readonly random: Rng;
}

/** What one attempted swap did, so the surface can narrate it. */
export interface SevenDaysMoveResult {
  readonly session: SevenDaysSession;
  /** Empty when nothing happened; otherwise a short line for aria-live. */
  readonly announcement: string;
  /** True when the swap did not form a run and the tiles snapped back. */
  readonly rejected: boolean;
  readonly reshuffled: boolean;
}

function goalsMet(
  level: SevenDaysLevel,
  gathered: Readonly<Record<SevenDaysTileId, number>>,
): boolean {
  return level.goals.every((goal) => gathered[goal.tile] >= goal.count);
}

function addTallies(
  base: Readonly<Record<SevenDaysTileId, number>>,
  extra: Readonly<Record<SevenDaysTileId, number>>,
): Record<SevenDaysTileId, number> {
  const next = tileTally();
  for (const key of Object.keys(next) as SevenDaysTileId[]) {
    next[key] = base[key] + extra[key];
  }
  return next;
}

/**
 * Opens a level. The seed makes a board reproducible, so a restart with the
 * same attempt number deals the same board and a bug can be replayed exactly.
 */
export function startLevel(
  level: SevenDaysLevel,
  attempt = 0,
): SevenDaysSession {
  const random = boardRng(`${level.id}:${attempt}`);
  const board = createBoard(BOARD_ROWS, BOARD_COLS, level.tiles, random);
  return {
    random,
    state: {
      level,
      board,
      movesLeft: level.moves,
      gathered: tileTally(),
      points: 0,
      status: "playing",
      selected: null,
    },
  };
}

/** Tap-to-select semantics: a second tap on the same tile lets it go. */
export function selectTile(
  session: SevenDaysSession,
  index: number,
): SevenDaysSession {
  const { state } = session;
  if (state.status !== "playing") return session;
  if (index < 0 || index >= state.board.cells.length) return session;
  return {
    ...session,
    state: { ...state, selected: state.selected === index ? null : index },
  };
}

export function clearSelection(session: SevenDaysSession): SevenDaysSession {
  if (session.state.selected === null) return session;
  return { ...session, state: { ...session.state, selected: null } };
}

/**
 * Trades two neighbouring tiles.
 *
 * A swap that forms no run costs nothing — it simply snaps back. Only a swap
 * that gathers something spends a move, so a misjudged tap never punishes the
 * reader for exploring the board.
 */
export function trySwap(
  session: SevenDaysSession,
  a: number,
  b: number,
): SevenDaysMoveResult {
  const { state, random } = session;
  const unchanged: SevenDaysMoveResult = {
    session,
    announcement: "",
    rejected: false,
    reshuffled: false,
  };
  if (state.status !== "playing") return unchanged;
  if (!areAdjacent(state.board, a, b)) return unchanged;

  const swapped = swapCells(state.board, a, b);
  if (findMatches(swapped).size === 0) {
    return {
      session: { ...session, state: { ...state, selected: null } },
      announcement: "Those two do not gather anything. No move was spent.",
      rejected: true,
      reshuffled: false,
    };
  }

  const resolution = resolveMatches(swapped, state.level.tiles, random);
  const gathered = addTallies(state.gathered, resolution.cleared);
  const movesLeft = state.movesLeft - 1;
  const cleared = goalsMet(state.level, gathered);

  let board = resolution.board;
  let reshuffled = false;
  // A board with no move left in it is a dead end, not a challenge. Rearranging
  // the same tiles costs the reader nothing they had already gathered.
  if (!cleared && movesLeft > 0 && !hasAvailableMove(board)) {
    board = reshuffleBoard(board, state.level.tiles, random);
    reshuffled = true;
  }

  const status = cleared
    ? "cleared"
    : movesLeft <= 0
      ? "out-of-moves"
      : "playing";

  return {
    session: {
      random,
      state: {
        ...state,
        board,
        movesLeft,
        gathered,
        points: state.points + resolution.points,
        status,
        selected: null,
      },
    },
    announcement: describeMove(resolution.cascades, status, reshuffled),
    rejected: false,
    reshuffled,
  };
}

function describeMove(
  cascades: number,
  status: SevenDaysLevelState["status"],
  reshuffled: boolean,
): string {
  if (status === "cleared") return "The day is gathered. Well done.";
  if (status === "out-of-moves") {
    return "The moves are spent. You can begin this level again whenever you like.";
  }
  const base =
    cascades > 1 ? `Gathered, and ${cascades - 1} more fell into place.` : "Gathered.";
  return reshuffled ? `${base} The board was rearranged so a move remains.` : base;
}

/** Free, unlimited: being stuck is never something to buy a way out of. */
export function shuffleSession(session: SevenDaysSession): SevenDaysSession {
  const { state, random } = session;
  if (state.status !== "playing") return session;
  return {
    random,
    state: {
      ...state,
      board: reshuffleBoard(state.board, state.level.tiles, random),
      selected: null,
    },
  };
}

/** How far along one goal is, for the HUD and for assistive announcements. */
export function goalProgress(
  state: SevenDaysLevelState,
): { tile: SevenDaysTileId; have: number; need: number; met: boolean }[] {
  return state.level.goals.map((goal) => ({
    tile: goal.tile,
    have: Math.min(state.gathered[goal.tile], goal.count),
    need: goal.count,
    met: state.gathered[goal.tile] >= goal.count,
  }));
}
