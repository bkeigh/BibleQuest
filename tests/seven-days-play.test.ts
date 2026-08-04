import { describe, expect, it } from "vitest";
import { boardRng, tileTally } from "@/lib/games/seven-days/board";
import { SEVEN_DAYS_LEVELS } from "@/lib/games/seven-days/levels";
import {
  addMoves,
  clearSelection,
  findHint,
  gatherKind,
  goalProgress,
  selectTile,
  shuffleSession,
  startLevel,
  trySwap,
  type SevenDaysSession,
} from "@/lib/games/seven-days/play";
import {
  BLOCKED,
  type SevenDaysBoard,
  type SevenDaysLevel,
  type SevenDaysLevelState,
} from "@/lib/games/seven-days/types";

const LEVEL = SEVEN_DAYS_LEVELS[0];

const LEGEND = {
  L: "light",
  W: "waters",
  D: "land",
  S: "seed",
  G: "wing",
  "#": BLOCKED,
} as const;

function board(rows: string[]): SevenDaysBoard {
  return {
    rows: rows.length,
    cols: rows[0].length,
    cells: rows.flatMap((row) =>
      [...row].map((glyph) => LEGEND[glyph as keyof typeof LEGEND]),
    ),
  };
}

function session(
  cells: SevenDaysBoard,
  overrides: Partial<SevenDaysLevelState> = {},
  level: SevenDaysLevel = LEVEL,
): SevenDaysSession {
  return {
    random: boardRng("fixture"),
    state: {
      level,
      board: cells,
      movesLeft: level.moves,
      gathered: tileTally(),
      points: 0,
      status: "playing",
      selected: null,
      ...overrides,
    },
  };
}

/** A board where swapping 0 and 1 completes a run of three lights. */
const SWAPPABLE = board([
  "WLDS",
  "LGWD",
  "LDSG",
  "GSDW",
]);

describe("startLevel", () => {
  it("deals a reproducible board for the same attempt", () => {
    const first = startLevel(LEVEL, 3);
    const second = startLevel(LEVEL, 3);
    expect(second.state.board).toEqual(first.state.board);
    expect(startLevel(LEVEL, 4).state.board).not.toEqual(first.state.board);
  });

  it("opens with the level's moves, nothing gathered, and nothing selected", () => {
    const { state } = startLevel(LEVEL);
    expect(state.movesLeft).toBe(LEVEL.moves);
    expect(state.points).toBe(0);
    expect(state.status).toBe("playing");
    expect(state.selected).toBeNull();
    expect(Object.values(state.gathered).every((count) => count === 0)).toBe(true);
  });
});

describe("selectTile and clearSelection", () => {
  it("selects, then lets go on a second tap of the same tile", () => {
    const opened = startLevel(LEVEL);
    const selected = selectTile(opened, 4);
    expect(selected.state.selected).toBe(4);
    expect(selectTile(selected, 4).state.selected).toBeNull();
    expect(selectTile(selected, 5).state.selected).toBe(5);
  });

  it("ignores out-of-range taps and taps on a finished level", () => {
    const opened = startLevel(LEVEL);
    expect(selectTile(opened, -1)).toBe(opened);
    expect(selectTile(opened, opened.state.board.cells.length)).toBe(opened);

    const finished = session(SWAPPABLE, { status: "cleared" });
    expect(selectTile(finished, 0)).toBe(finished);
  });

  it("clears an existing selection and keeps the same object when there is none", () => {
    const opened = startLevel(LEVEL);
    expect(clearSelection(opened)).toBe(opened);
    expect(clearSelection(selectTile(opened, 2)).state.selected).toBeNull();
  });
});

describe("trySwap", () => {
  it("does nothing for non-adjacent tiles or a finished level", () => {
    const live = session(SWAPPABLE);
    const far = trySwap(live, 0, 5);
    expect(far.session).toBe(live);
    expect(far.steps).toEqual([]);
    expect(far.announcement).toBe("");

    const finished = session(SWAPPABLE, { status: "out-of-moves" });
    expect(trySwap(finished, 0, 1).session).toBe(finished);
  });

  it("snaps a fruitless swap back without spending a move", () => {
    const live = session(SWAPPABLE);
    const result = trySwap(live, 0, 4);
    expect(result.rejected).toBe(true);
    expect(result.session.state.movesLeft).toBe(live.state.movesLeft);
    expect(result.session.state.board).toBe(live.state.board);
    expect(result.session.state.selected).toBeNull();
    expect(result.swapped).toBeDefined();
    expect(result.announcement).toContain("No move was spent");
  });

  it("spends one move, gathers the run, and narrates the cascade", () => {
    const result = trySwap(session(SWAPPABLE), 0, 1);
    expect(result.rejected).toBe(false);
    expect(result.session.state.movesLeft).toBe(LEVEL.moves - 1);
    expect(result.session.state.gathered.light).toBeGreaterThanOrEqual(3);
    expect(result.session.state.points).toBeGreaterThan(0);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.announcement.length).toBeGreaterThan(0);
  });

  it("clears the level once every goal is met", () => {
    const nearlyThere = session(SWAPPABLE, {
      gathered: { ...tileTally(), light: 100, waters: 100, land: 100, seed: 100, wing: 100 },
    });
    const result = trySwap(nearlyThere, 0, 1);
    expect(result.session.state.status).toBe("cleared");
    expect(result.announcement).toBe("The day is gathered. Well done.");
  });

  it("ends the level gently when the last move is spent without the goals", () => {
    const lastMove = session(SWAPPABLE, { movesLeft: 1 });
    const result = trySwap(lastMove, 0, 1);
    expect(result.session.state.status).toBe("out-of-moves");
    expect(result.announcement).toContain("begin this level again");
  });
});

describe("addMoves", () => {
  it("tops up a live level and drops the selection", () => {
    const live = selectTile(session(SWAPPABLE), 3);
    const topped = addMoves(live, 5);
    expect(topped.state.movesLeft).toBe(LEVEL.moves + 5);
    expect(topped.state.selected).toBeNull();
  });

  it("refuses a non-positive top-up or a finished level", () => {
    const live = session(SWAPPABLE);
    expect(addMoves(live, 0)).toBe(live);
    expect(addMoves(live, -3)).toBe(live);
    const cleared = session(SWAPPABLE, { status: "cleared" });
    expect(addMoves(cleared, 5)).toBe(cleared);
  });
});

describe("gatherKind", () => {
  it("clears every tile of one kind without spending a move", () => {
    const live = session(SWAPPABLE);
    const lights = live.state.board.cells.filter((cell) => cell === "light").length;
    const { session: after, gathered } = gatherKind(live, "light");
    expect(gathered).toBe(lights);
    expect(after.state.gathered.light).toBeGreaterThanOrEqual(lights);
    expect(after.state.movesLeft).toBe(live.state.movesLeft);
    expect(after.state.points).toBeGreaterThanOrEqual(lights * 5);
    expect(after.state.board.cells).not.toContain(null);
  });

  it("does nothing when the kind is not on the board or the level is over", () => {
    const noWings = session(board(["LDSL", "DSLD", "SLDS", "LDSL"]));
    expect(gatherKind(noWings, "wing")).toEqual({
      session: noWings,
      gathered: 0,
    });

    const cleared = session(SWAPPABLE, { status: "cleared" });
    expect(gatherKind(cleared, "light").gathered).toBe(0);
  });

  it("can finish the level when what it gathers meets the goals", () => {
    const generousGoal: SevenDaysLevel = {
      ...LEVEL,
      goals: [{ tile: "light", count: 1 }],
    };
    const { session: after } = gatherKind(
      session(SWAPPABLE, {}, generousGoal),
      "light",
    );
    expect(after.state.status).toBe("cleared");
  });
});

describe("shuffleSession", () => {
  it("rearranges a live board and keeps everything else", () => {
    const live = selectTile(session(SWAPPABLE, { points: 40 }), 2);
    const shuffled = shuffleSession(live);
    expect(shuffled.state.points).toBe(40);
    expect(shuffled.state.selected).toBeNull();
    expect([...shuffled.state.board.cells].sort()).toEqual(
      [...live.state.board.cells].sort(),
    );
  });

  it("leaves a finished level alone", () => {
    const cleared = session(SWAPPABLE, { status: "cleared" });
    expect(shuffleSession(cleared)).toBe(cleared);
  });
});

describe("findHint", () => {
  it("returns an adjacent trade that gathers something", () => {
    const hint = findHint(session(SWAPPABLE));
    expect(hint).not.toBeNull();
    const { session: after } = trySwap(
      session(SWAPPABLE),
      hint!.from,
      hint!.to,
    );
    expect(after.state.movesLeft).toBe(LEVEL.moves - 1);
  });

  it("returns nothing on a board with no move in it", () => {
    expect(
      findHint(
        session(
          board([
            "SSLD",
            "GGLD",
            "LDSG",
            "GWWG",
          ]),
        ),
      ),
    ).toBeNull();
  });
});

describe("goalProgress", () => {
  it("caps progress at what each goal needs", () => {
    const level: SevenDaysLevel = {
      ...LEVEL,
      goals: [
        { tile: "light", count: 5 },
        { tile: "seed", count: 4 },
      ],
    };
    const state = session(
      SWAPPABLE,
      { gathered: { ...tileTally(), light: 9, seed: 2 } },
      level,
    ).state;
    expect(goalProgress(state)).toEqual([
      { tile: "light", have: 5, need: 5, met: true },
      { tile: "seed", have: 2, need: 4, met: false },
    ]);
  });
});
