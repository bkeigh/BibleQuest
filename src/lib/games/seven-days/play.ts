import {
  settleBoard,
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

import type {
  SevenDaysBoard,
  SevenDaysLevel,
  SevenDaysLevelState,
  SevenDaysStep,
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
  /**
   * The board with the two tiles traded, before anything is matched — the
   * frame a reader needs to see to understand that their swap is what caused
   * everything after it.
   */
  readonly swapped?: SevenDaysBoard;
  /** The cascade, wave by wave, for a surface that plays it out. */
  readonly steps: readonly SevenDaysStep[];
  /** Where the board settles if it had to be rearranged after the cascade. */
  readonly reshuffledBoard?: SevenDaysBoard;
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
  const board = createBoard(level.mask, level.tiles, random);
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
    steps: [],
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
      swapped,
      steps: [],
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
    swapped,
    steps: resolution.steps,
    ...(reshuffled ? { reshuffledBoard: board } : {}),
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

/**
 * Adds moves to a level already underway.
 *
 * Spent from a reader's own inventory, and only while a level is still live —
 * a level that has been cleared or spent is finished, and topping it up after
 * the fact would let a help rewrite a result rather than change a game.
 */
export function addMoves(
  session: SevenDaysSession,
  moves: number,
): SevenDaysSession {
  const { state } = session;
  if (state.status !== "playing" || moves <= 0) return session;
  return {
    ...session,
    state: { ...state, movesLeft: state.movesLeft + moves, selected: null },
  };
}

/**
 * Clears every tile of one kind, as one move's worth of cascade.
 *
 * It costs no move: the boost is the cost. Everything it gathers counts toward
 * goals exactly as a matched run would, because a help that did not count
 * would be a help in name only.
 */
export function gatherKind(
  session: SevenDaysSession,
  tile: SevenDaysTileId,
): { session: SevenDaysSession; gathered: number } {
  const { state, random } = session;
  if (state.status !== "playing") return { session, gathered: 0 };
  const cells = state.board.cells.map((cell) => (cell === tile ? null : cell));
  const emptied = { ...state.board, cells };
  const removed = state.board.cells.filter((cell) => cell === tile).length;
  if (removed === 0) return { session, gathered: 0 };

  const resolution = resolveMatches(
    settleBoard(emptied, state.level.tiles, random),
    state.level.tiles,
    random,
  );
  const gathered = tileTally();
  for (const key of Object.keys(gathered) as SevenDaysTileId[]) {
    gathered[key] = state.gathered[key] + resolution.cleared[key];
  }
  gathered[tile] += removed;

  const cleared = goalsMet(state.level, gathered);
  return {
    session: {
      random,
      state: {
        ...state,
        board: resolution.board,
        gathered,
        points: state.points + resolution.points + removed * 5,
        status: cleared ? "cleared" : state.status,
        selected: null,
      },
    },
    gathered: removed,
  };
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

/**
 * A trade that would gather something, for the hint boost.
 *
 * Returns the first it finds in reading order rather than the best one: this
 * is meant to unstick someone, not to play the level for them.
 */
export function findHint(
  session: SevenDaysSession,
): { from: number; to: number } | null {
  const { board } = session.state;
  for (let index = 0; index < board.cells.length; index += 1) {
    for (const other of [index + 1, index + board.cols]) {
      if (other >= board.cells.length) continue;
      if (!areAdjacent(board, index, other)) continue;
      if (findMatches(swapCells(board, index, other)).size > 0) {
        return { from: index, to: other };
      }
    }
  }
  return null;
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
