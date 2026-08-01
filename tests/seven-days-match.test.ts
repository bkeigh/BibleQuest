import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  areAdjacent,
  boardRng,
  findMatches,
  hasAvailableMove,
  reshuffleBoard,
  resolveMatches,
  swapCells,
} from "@/lib/games/seven-days/board";
import {
  SEVEN_DAYS_CHAPTERS,
  SEVEN_DAYS_LEVELS_PER_CHAPTER,
} from "@/lib/games/seven-days/content";
import {
  BOARD_COLS,
  BOARD_ROWS,
  SEVEN_DAYS_LEVELS,
  levelOrdinal,
  questionForLevel,
} from "@/lib/games/seven-days/levels";
import {
  goalProgress,
  selectTile,
  shuffleSession,
  startLevel,
  trySwap,
} from "@/lib/games/seven-days/play";
import {
  emptySevenDaysProgress,
  isLevelUnlocked,
  markLevelCleared,
  nextLevel,
  readSevenDaysProgress,
  sanitizeSevenDaysProgress,
  summarize,
  writeSevenDaysProgress,
  SEVEN_DAYS_STORAGE_KEY,
} from "@/lib/games/seven-days/progress";
import { collectSevenDaysContentErrors } from "@/lib/games/seven-days/validation";
import type { SevenDaysBoard } from "@/lib/games/seven-days/types";

function board(rows: string[]): SevenDaysBoard {
  const legend = {
    L: "light",
    W: "waters",
    D: "land",
    S: "seed",
    G: "wing",
  } as const;
  const cells = rows.flatMap((row) =>
    [...row].map((glyph) => legend[glyph as keyof typeof legend]),
  );
  return { rows: rows.length, cols: rows[0].length, cells };
}

describe("Seven Days Match board", () => {
  it("finds horizontal and vertical runs of three", () => {
    const matched = findMatches(
      board([
        "LLLW",
        "WSDW",
        "DSDS",
        "GSGL",
      ]),
    );
    // Row 0 columns 0–2, and column 1 rows 1–3.
    expect([...matched].sort((a, b) => a - b)).toEqual([0, 1, 2, 5, 9, 13]);
  });

  it("keeps a shared cell once when two runs cross", () => {
    const matched = findMatches(
      board([
        "WLWW",
        "WLWW",
        "LLLW",
        "SGSD",
      ]),
    );
    expect(matched.has(9)).toBe(true);
    expect(matched.size).toBe(new Set(matched).size);
  });

  it("reports no match for a run of two", () => {
    expect(findMatches(board(["LLWS", "DGDG", "SWSW", "GDGD"])).size).toBe(0);
  });

  it("only lets orthogonal neighbours trade places", () => {
    const grid = board(["LWSG", "WSGL", "SGLW", "GLWS"]);
    expect(areAdjacent(grid, 0, 1)).toBe(true);
    expect(areAdjacent(grid, 0, 4)).toBe(true);
    expect(areAdjacent(grid, 0, 5)).toBe(false);
    expect(areAdjacent(grid, 0, 0)).toBe(false);
  });

  it("clears, drops, refills, and reports what a cascade gathered", () => {
    const random = boardRng("cascade");
    const resolution = resolveMatches(
      board(["LLLW", "WSDW", "DSDS", "GSGL"]),
      ["light", "waters", "land", "seed"],
      random,
    );
    expect(resolution.cleared.light).toBeGreaterThanOrEqual(3);
    expect(resolution.cleared.seed).toBeGreaterThanOrEqual(3);
    expect(resolution.points).toBeGreaterThan(0);
    expect(findMatches(resolution.board).size).toBe(0);
    expect(resolution.board.cells.every((cell) => cell !== null)).toBe(true);
  });

  it("opens every level on a settled board that still has a move", () => {
    for (const level of SEVEN_DAYS_LEVELS) {
      const { state } = startLevel(level);
      expect(state.board.rows).toBe(BOARD_ROWS);
      expect(state.board.cols).toBe(BOARD_COLS);
      expect(findMatches(state.board).size).toBe(0);
      expect(hasAvailableMove(state.board)).toBe(true);
      expect(
        state.board.cells.every(
          (cell) => cell !== null && level.tiles.includes(cell),
        ),
      ).toBe(true);
    }
  });

  it("rearranges the same tiles rather than dealing new ones", () => {
    const original = startLevel(SEVEN_DAYS_LEVELS[0]).state.board;
    const shuffled = reshuffleBoard(
      original,
      SEVEN_DAYS_LEVELS[0].tiles,
      boardRng("shuffle"),
    );
    const tally = (grid: SevenDaysBoard) =>
      grid.cells.reduce<Record<string, number>>((counts, cell) => {
        if (cell) counts[cell] = (counts[cell] ?? 0) + 1;
        return counts;
      }, {});
    expect(tally(shuffled)).toEqual(tally(original));
    expect(hasAvailableMove(shuffled)).toBe(true);
  });
});

describe("Seven Days Match play", () => {
  it("spends no move on a swap that gathers nothing", () => {
    const session = startLevel(SEVEN_DAYS_LEVELS[0]);
    const { board: grid } = session.state;
    // Find a neighbouring pair whose trade forms no run.
    let pair: [number, number] | null = null;
    for (let index = 0; index < grid.cells.length - 1 && !pair; index += 1) {
      const right = index + 1;
      if (!areAdjacent(grid, index, right)) continue;
      if (findMatches(swapCells(grid, index, right)).size === 0) {
        pair = [index, right];
      }
    }
    expect(pair).not.toBeNull();
    const result = trySwap(session, pair![0], pair![1]);
    expect(result.rejected).toBe(true);
    expect(result.session.state.movesLeft).toBe(session.state.movesLeft);
    expect(result.session.state.board.cells).toEqual(grid.cells);
  });

  it("spends a move and gathers tiles on a swap that forms a run", () => {
    const session = startLevel(SEVEN_DAYS_LEVELS[0]);
    const { board: grid } = session.state;
    let pair: [number, number] | null = null;
    for (let index = 0; index < grid.cells.length && !pair; index += 1) {
      for (const other of [index + 1, index + grid.cols]) {
        if (other >= grid.cells.length) continue;
        if (!areAdjacent(grid, index, other)) continue;
        if (findMatches(swapCells(grid, index, other)).size > 0) {
          pair = [index, other];
          break;
        }
      }
    }
    expect(pair).not.toBeNull();
    const result = trySwap(session, pair![0], pair![1]);
    expect(result.rejected).toBe(false);
    expect(result.session.state.movesLeft).toBe(session.state.movesLeft - 1);
    expect(result.session.state.points).toBeGreaterThan(0);
    expect(
      Object.values(result.session.state.gathered).reduce((a, b) => a + b, 0),
    ).toBeGreaterThanOrEqual(3);
  });

  it("toggles a selection off when the same tile is tapped twice", () => {
    const session = startLevel(SEVEN_DAYS_LEVELS[0]);
    expect(selectTile(session, 4).state.selected).toBe(4);
    expect(selectTile(selectTile(session, 4), 4).state.selected).toBeNull();
  });

  it("keeps a free shuffle playable and non-destructive", () => {
    const session = startLevel(SEVEN_DAYS_LEVELS[3]);
    const shuffled = shuffleSession(session);
    expect(shuffled.state.movesLeft).toBe(session.state.movesLeft);
    expect(shuffled.state.gathered).toEqual(session.state.gathered);
    expect(hasAvailableMove(shuffled.state.board)).toBe(true);
  });

  it("deals the same board for the same level and attempt", () => {
    const first = startLevel(SEVEN_DAYS_LEVELS[10], 2).state.board.cells;
    const second = startLevel(SEVEN_DAYS_LEVELS[10], 2).state.board.cells;
    const other = startLevel(SEVEN_DAYS_LEVELS[10], 3).state.board.cells;
    expect(second).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it("reports goal progress without ever exceeding the goal", () => {
    const session = startLevel(SEVEN_DAYS_LEVELS[0]);
    const progress = goalProgress(session.state);
    expect(progress).toHaveLength(SEVEN_DAYS_LEVELS[0].goals.length);
    for (const goal of progress) {
      expect(goal.have).toBeLessThanOrEqual(goal.need);
      expect(goal.met).toBe(false);
    }
  });
});

describe("Seven Days Match levels", () => {
  it("builds seven levels for each of the seven days", () => {
    expect(SEVEN_DAYS_CHAPTERS).toHaveLength(7);
    expect(SEVEN_DAYS_LEVELS).toHaveLength(49);
    for (const chapter of SEVEN_DAYS_CHAPTERS) {
      const levels = SEVEN_DAYS_LEVELS.filter(
        (level) => level.chapterId === chapter.id,
      );
      expect(levels).toHaveLength(SEVEN_DAYS_LEVELS_PER_CHAPTER);
      expect(levels.map((level) => level.level)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it("never asks for more moves back than it grants, and stays winnable", () => {
    for (const level of SEVEN_DAYS_LEVELS) {
      expect(level.moves).toBeGreaterThanOrEqual(12);
      const asked = level.goals.reduce((total, goal) => total + goal.count, 0);
      // Three tiles per match is the floor; a level asking for more than the
      // move budget could ever clear would be unwinnable by construction.
      expect(asked).toBeLessThanOrEqual(level.moves * 3);
    }
  });

  it("tightens as the week goes on", () => {
    const first = SEVEN_DAYS_LEVELS[0];
    const last = SEVEN_DAYS_LEVELS[SEVEN_DAYS_LEVELS.length - 1];
    expect(last.moves).toBeLessThan(first.moves);
    expect(last.goals[0].count).toBeGreaterThan(first.goals[0].count);
    expect(first.tiles).toHaveLength(4);
    expect(last.tiles).toHaveLength(5);
  });

  it("gives every level exactly one question from its own day", () => {
    for (const level of SEVEN_DAYS_LEVELS) {
      const question = questionForLevel(level);
      expect(question).toBeDefined();
      expect(question?.id.startsWith(level.chapterId)).toBe(true);
    }
  });

  it("orders the single run of levels day by day", () => {
    expect(levelOrdinal(SEVEN_DAYS_LEVELS[0])).toBe(0);
    expect(levelOrdinal(SEVEN_DAYS_LEVELS[48])).toBe(48);
    SEVEN_DAYS_LEVELS.forEach((level, index) => {
      expect(levelOrdinal(level)).toBe(index);
    });
  });
});

describe("Seven Days Match content", () => {
  it("cites a passage that resolves for every chapter and question", () => {
    expect(collectSevenDaysContentErrors()).toEqual([]);
  });

  it("never hides an answer behind a purchase or a wrong guess", () => {
    for (const chapter of SEVEN_DAYS_CHAPTERS) {
      for (const question of chapter.questions) {
        expect(question.explanation.length).toBeGreaterThan(20);
        expect(question.options[question.answerIndex]).toBeTruthy();
      }
    }
  });

  it("spreads the correct answer across all three positions", () => {
    const positions = SEVEN_DAYS_CHAPTERS.flatMap((chapter) =>
      chapter.questions.map((question) => question.answerIndex),
    );
    // A bank where the answer is always first teaches the pattern, not the text.
    expect(new Set(positions)).toEqual(new Set([0, 1, 2]));
  });
});

describe("Seven Days Match progress", () => {
  function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (key: string) => map.get(key) ?? null,
      key: (index: number) => [...map.keys()][index] ?? null,
      removeItem: (key: string) => void map.delete(key),
      setItem: (key: string, value: string) => void map.set(key, value),
    } as Storage;
  }

  it("opens only the first level to a new reader", () => {
    const progress = emptySevenDaysProgress();
    expect(isLevelUnlocked(progress, SEVEN_DAYS_LEVELS[0])).toBe(true);
    expect(isLevelUnlocked(progress, SEVEN_DAYS_LEVELS[1])).toBe(false);
    expect(nextLevel(progress).id).toBe(SEVEN_DAYS_LEVELS[0].id);
  });

  it("opens the next level once the previous one is cleared", () => {
    const progress = markLevelCleared(
      emptySevenDaysProgress(),
      SEVEN_DAYS_LEVELS[0],
      true,
    );
    expect(isLevelUnlocked(progress, SEVEN_DAYS_LEVELS[1])).toBe(true);
    expect(isLevelUnlocked(progress, SEVEN_DAYS_LEVELS[2])).toBe(false);
    expect(nextLevel(progress).id).toBe(SEVEN_DAYS_LEVELS[1].id);
    expect(summarize(progress)).toMatchObject({
      cleared: 1,
      firstTry: 1,
      daysOpened: 1,
      complete: false,
    });
  });

  it("does not record the same level twice", () => {
    let progress = markLevelCleared(
      emptySevenDaysProgress(),
      SEVEN_DAYS_LEVELS[0],
      true,
    );
    progress = markLevelCleared(progress, SEVEN_DAYS_LEVELS[0], false);
    expect(progress.cleared).toHaveLength(1);
    expect(progress.firstTry).toHaveLength(1);
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const progress = markLevelCleared(
      emptySevenDaysProgress(),
      SEVEN_DAYS_LEVELS[0],
      false,
    );
    expect(writeSevenDaysProgress(progress, storage)).toBe(true);
    expect(readSevenDaysProgress(storage)).toEqual(progress);
  });

  it("discards a record that did not come from this catalogue", () => {
    expect(
      sanitizeSevenDaysProgress({
        version: 1,
        contentVersion: 1,
        cleared: ["day-9-level-1"],
        firstTry: [],
        updatedAt: 1,
      }),
    ).toBeNull();
    // A first-try mark without a clear is not a state this game can produce.
    expect(
      sanitizeSevenDaysProgress({
        version: 1,
        contentVersion: 1,
        cleared: [],
        firstTry: [SEVEN_DAYS_LEVELS[0].id],
        updatedAt: 1,
      }),
    ).toBeNull();
    expect(sanitizeSevenDaysProgress({ version: 99 })).toBeNull();
  });

  it("starts fresh rather than showing a map with holes in it", () => {
    const storage = memoryStorage();
    storage.setItem(SEVEN_DAYS_STORAGE_KEY, '{"version":1,"cleared":"nope"}');
    expect(readSevenDaysProgress(storage).cleared).toEqual([]);
    expect(storage.getItem(SEVEN_DAYS_STORAGE_KEY)).toBeNull();
  });
});

describe("Seven Days Match product boundaries", () => {
  const sourceOf = (file: string) =>
    readFileSync(join("src/components/games/seven-days", file), "utf8");
  const screen = sourceOf("SevenDaysMatchScreen.tsx");
  const session = sourceOf("SevenDaysLevelSession.tsx");
  const question = sourceOf("SevenDaysQuestionCard.tsx");
  const board = sourceOf("SevenDaysBoard.tsx");
  const all = [screen, session, question, board].join("\n");

  it("sells nothing and takes nothing away for losing", () => {
    // Match-three usually runs on lives, timers, and boosters. None of those
    // belong on a surface that also promises every answer for free, so none of
    // their vocabulary may reach the reader. Comments are stripped first: prose
    // about where state "lives" is not a life system.
    const copy = all
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll(/^\s*\/\/.*$/gm, "")
      .toLocaleLowerCase();
    for (const word of [
      "booster",
      "power-up",
      "gems",
      "coins",
      "purchase",
      "out of lives",
      "watch an ad",
    ]) {
      expect(copy).not.toContain(word);
    }
    expect(screen).toContain("nothing to buy");
    expect(session).toContain("no wait and no cost");
  });

  it("emits only bounded game-kind lifecycle analytics", () => {
    const calls = all.match(/track\(/g) ?? [];
    const bounded =
      all.match(
        /track\(\s*"scripture_game_(?:started|completed)"\s*,\s*\{\s*kind:\s*"seven-days-match"\s*,?\s*\}\s*\)/g,
      ) ?? [];
    expect(bounded).toHaveLength(calls.length);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("keeps the board reachable without a confident thumb", () => {
    // Match-three is usually swipe-only. Every cell here is a real button with
    // its position in the label, so a keyboard or screen reader can play it.
    expect(board).toContain("aria-pressed={isSelected}");
    expect(board).toContain("row ${row}, column ${col}");
    expect(board).toContain('case "ArrowRight"');
    expect(board).toContain("onSwap(selected, index)");
  });

  it("shows the answer and the passage however the reader chose", () => {
    expect(question).toContain("question.explanation");
    expect(question).toContain("scriptureSourceHref(question.source)");
    // The Continue button must not depend on having been right.
    expect(question).toContain("disabled={!answered}");
    expect(question).not.toContain("disabled={!correct}");
  });

  it("never animates a phase out, so a screen can always change", () => {
    // AnimatePresence mode="wait" once left the hub mounted forever when its
    // exit never completed: the game looked frozen on a working build.
    expect(all).not.toContain("AnimatePresence");
    expect(all).not.toContain("exit={{");
  });
});
