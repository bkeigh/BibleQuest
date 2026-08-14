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
  levelsForChapter,
  verseForLevel,
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
  isDayAnswered,
  isDayReadyForQuestions,
  isDaySkipped,
  isDayUnlocked,
  isLevelUnlocked,
  markDayAnswered,
  markDaySkipped,
  markLevelCleared,
  nextLevel,
  pendingQuestionDay,
  readSevenDaysProgress,
  sanitizeSevenDaysProgress,
  summarize,
  writeSevenDaysProgress,
  SEVEN_DAYS_STORAGE_KEY,
} from "@/lib/games/seven-days/progress";
import { collectSevenDaysContentErrors } from "@/lib/games/seven-days/validation";
import {
  BOOSTS,
  BOOST_IDS,
  EMPTY_INVENTORY,
  boostsEarnedForRound,
  grantBoost,
  sanitizeInventory,
  spendBoost,
} from "@/lib/games/arcade/boosts";
import {
  ARCADE_PRODUCTS,
} from "@/lib/games/arcade/store";
import {
  BLOCKED,
  type SevenDaysBoard,
} from "@/lib/games/seven-days/types";

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
          (cell) =>
            cell === BLOCKED ||
            (cell !== null && level.tiles.includes(cell)),
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

  it("starts with a firmer move budget and goal", () => {
    const first = SEVEN_DAYS_LEVELS[0];
    // These bounds keep the opening intentional without making it a late-game wall.
    expect(first.moves).toBeLessThanOrEqual(28);
    expect(first.moves).toBeGreaterThanOrEqual(24);
    expect(first.goals[0].count).toBeGreaterThanOrEqual(12);
  });

  it("gives every level its own shape and scene", () => {
    for (const chapter of SEVEN_DAYS_CHAPTERS) {
      const shapes = levelsForChapter(chapter.id).map((level) =>
        level.mask.join("|"),
      );
      // Seven levels, seven different boards — a day is not the same board
      // played seven times.
      expect(new Set(shapes).size).toBe(SEVEN_DAYS_LEVELS_PER_CHAPTER);
    }
    for (const level of SEVEN_DAYS_LEVELS) {
      expect(level.sceneId).toBeTruthy();
      expect(verseForLevel(level)).not.toBeNull();
    }
  });

  it("draws each level's verse from its own day", () => {
    for (const level of SEVEN_DAYS_LEVELS) {
      const chapter = SEVEN_DAYS_CHAPTERS[level.day - 1];
      const verse = verseForLevel(level)!;
      expect(verse.source.chapter).toBe(chapter.source.chapter);
      expect(verse.source.verseStart).toBeGreaterThanOrEqual(
        chapter.source.verseStart,
      );
      expect(verse.source.verseStart).toBeLessThanOrEqual(
        chapter.source.verseEnd ?? chapter.source.verseStart,
      );
      // Fixed per level, so it is a line a reader can come back to and save.
      expect(verseForLevel(level)).toEqual(verse);
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
    );
    expect(isLevelUnlocked(progress, SEVEN_DAYS_LEVELS[1])).toBe(true);
    expect(isLevelUnlocked(progress, SEVEN_DAYS_LEVELS[2])).toBe(false);
    expect(nextLevel(progress).id).toBe(SEVEN_DAYS_LEVELS[1].id);
    expect(summarize(progress)).toMatchObject({
      cleared: 1,
      daysAnswered: 0,
      daysOpened: 1,
      complete: false,
    });
  });

  it("does not record the same level twice", () => {
    let progress = markLevelCleared(
      emptySevenDaysProgress(),
      SEVEN_DAYS_LEVELS[0],
    );
    progress = markLevelCleared(progress, SEVEN_DAYS_LEVELS[0]);
    expect(progress.cleared).toHaveLength(1);
  });

  it("holds the next day shut until this day's questions are answered", () => {
    // Clearing all seven levels of day one is not enough on its own — the
    // questions are the gate, which is the whole point of gathering them into
    // a round instead of scattering one after every board.
    let progress = emptySevenDaysProgress();
    for (const level of levelsForChapter(SEVEN_DAYS_CHAPTERS[0].id)) {
      progress = markLevelCleared(progress, level);
    }
    const dayTwoFirst = levelsForChapter(SEVEN_DAYS_CHAPTERS[1].id)[0];
    expect(isDayUnlocked(progress, SEVEN_DAYS_CHAPTERS[1])).toBe(false);
    expect(isLevelUnlocked(progress, dayTwoFirst)).toBe(false);
    expect(isDayReadyForQuestions(progress, SEVEN_DAYS_CHAPTERS[0])).toBe(true);
    expect(pendingQuestionDay(progress)?.id).toBe(SEVEN_DAYS_CHAPTERS[0].id);

    progress = markDayAnswered(progress, SEVEN_DAYS_CHAPTERS[0], [
      SEVEN_DAYS_CHAPTERS[0].questions[0].id,
    ]);
    expect(isDayUnlocked(progress, SEVEN_DAYS_CHAPTERS[1])).toBe(true);
    expect(isLevelUnlocked(progress, dayTwoFirst)).toBe(true);
    expect(pendingQuestionDay(progress)).toBeNull();
    expect(summarize(progress)).toMatchObject({
      daysAnswered: 1,
      daysOpened: 2,
      firstTry: 1,
    });
  });

  it("opens the next day whatever the score", () => {
    // Answering none of them right still opens the road: the explanations are
    // the point, and a wall would stop the reader who most needs the next one.
    let progress = emptySevenDaysProgress();
    for (const level of levelsForChapter(SEVEN_DAYS_CHAPTERS[0].id)) {
      progress = markLevelCleared(progress, level);
    }
    progress = markDayAnswered(progress, SEVEN_DAYS_CHAPTERS[0], []);
    expect(isDayUnlocked(progress, SEVEN_DAYS_CHAPTERS[1])).toBe(true);
    expect(progress.firstTry).toHaveLength(0);
  });

  it("opens one next day with a consumed Question Skip", () => {
    let progress = emptySevenDaysProgress();
    for (const level of levelsForChapter(SEVEN_DAYS_CHAPTERS[0].id)) {
      progress = markLevelCleared(progress, level);
    }
    progress = markDaySkipped(progress, SEVEN_DAYS_CHAPTERS[0]);
    expect(isDaySkipped(progress, SEVEN_DAYS_CHAPTERS[0])).toBe(true);
    expect(isDayAnswered(progress, SEVEN_DAYS_CHAPTERS[0])).toBe(false);
    expect(isDayUnlocked(progress, SEVEN_DAYS_CHAPTERS[1])).toBe(true);
    expect(summarize(progress)).toMatchObject({ daysSkipped: 1 });
  });

  it("lets Game Pass bypass chapter questions without changing progress", () => {
    const progress = emptySevenDaysProgress();
    expect(isDayUnlocked(progress, SEVEN_DAYS_CHAPTERS[6], true)).toBe(true);
    expect(
      isLevelUnlocked(
        progress,
        levelsForChapter(SEVEN_DAYS_CHAPTERS[6].id)[0],
        true,
      ),
    ).toBe(true);
    expect(progress.daysSkipped).toEqual([]);
  });

  it("migrates valid version-two progress without losing cleared levels", () => {
    const migrated = sanitizeSevenDaysProgress({
      version: 2,
      contentVersion: 1,
      cleared: [SEVEN_DAYS_LEVELS[0].id],
      daysAnswered: [],
      firstTry: [],
      updatedAt: 1,
    });
    expect(migrated).toMatchObject({
      version: 3,
      cleared: [SEVEN_DAYS_LEVELS[0].id],
      daysSkipped: [],
    });
  });

  it("round-trips through storage", async () => {
    const storage = memoryStorage();
    const progress = markLevelCleared(
      emptySevenDaysProgress(),
      SEVEN_DAYS_LEVELS[0],
    );
    await expect(writeSevenDaysProgress(progress, storage)).resolves.toBe(true);
    expect(readSevenDaysProgress(storage)).toEqual(progress);
  });

  it("discards a record that did not come from this catalogue", () => {
    expect(
      sanitizeSevenDaysProgress({
        version: 2,
        contentVersion: 1,
        cleared: ["day-9-level-1"],
        daysAnswered: [],
        firstTry: [],
        updatedAt: 1,
      }),
    ).toBeNull();
    // A day answered before its levels were played is not a state this game
    // can produce.
    expect(
      sanitizeSevenDaysProgress({
        version: 2,
        contentVersion: 1,
        cleared: [],
        daysAnswered: [SEVEN_DAYS_CHAPTERS[0].id],
        firstTry: [],
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
  const storeSource = readFileSync("src/lib/games/arcade/store.ts", "utf8");
  const all = [screen, session, question, board].join("\n");

  it("takes nothing away for losing, whatever it sells", () => {
    // The arcade sells optional question-gate access, so "nothing to buy" is
    // no longer the promise. These still are: no lives, timers, or waiting.
    // Comments are stripped first —
    // prose about where state "lives" is not a life system.
    const copy = all
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll(/^\s*\/\/.*$/gm, "")
      .toLocaleLowerCase();
    for (const word of ["out of lives", "watch an ad", "wait to play"]) {
      expect(copy).not.toContain(word);
    }
    // Running out of moves still offers another go before it offers a help.
    expect(session).toContain("Try this level again");
    expect(session).toContain("no wait and no cost");
    // The one thing the game does write is a bookmark the reader asked for,
    // and the pause card says so rather than claiming it changes nothing.
    expect(session).toContain("Playing does not change your Journey");
  });

  it("lets a thumb swipe without the page scrolling out from under it", () => {
    // The board shipped with swipe handlers and no `touchAction: "none"`, so
    // on a touch screen the browser claimed every vertical drag for scrolling
    // before a single pointermove arrived. Swiping — the first thing anyone
    // who has played a match-3 tries — silently did nothing.
    expect(board).toContain('touchAction: "none"');
    // Capture, or a release that lands off the origin tile never comes back
    // and leaves a stale swipe waiting to fire on an unrelated tap.
    expect(board).toContain("setPointerCapture");
    expect(board).toContain("onPointerCancel");
  });

  it("does not also count a completed swipe as a tap", () => {
    // A flick fires pointerup and then click. Without swallowing that click,
    // one swipe both traded the tiles and left the origin selected, so the
    // next tap traded again on its own.
    expect(board).toContain("swallowClick");
  });

  it("keeps the board playable without a thumb at all", () => {
    // Swiping is an addition, never a replacement. Arrow-key travel, the
    // tap-tap path, and the per-tile labels are what make the board reachable
    // by keyboard and screen reader.
    for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
      expect(board).toContain(key);
    }
    expect(board).toContain("onSelect(index)");
    expect(board).toContain("row ${row}, column ${col}");
  });

  it("offers only the two server-priced question-gate products", () => {
    expect(ARCADE_PRODUCTS).toMatchObject([
      {
        id: "question-skip",
        kind: "consumable",
        price: "$0.99",
        unitAmount: 99,
      },
      {
        id: "game-pass",
        kind: "entitlement",
        price: "$2.99",
        unitAmount: 299,
      },
    ]);
  });

  it("connects every Buy button to server-created Checkout", () => {
    const storeScreen = readFileSync(
      "src/components/games/ArcadeStore.tsx",
      "utf8",
    );
    expect(storeScreen).toContain("access.startCheckout(product.id)");
    expect(storeScreen).toContain("Thank you for your purchase");
    expect(storeScreen).toContain("pledges 5% of arcade purchase revenue");
    expect(storeSource).toContain("unitAmount: 99");
    expect(storeSource).toContain("unitAmount: 299");
  });

  it("keeps helps on the board and off the Scripture", () => {
    for (const id of BOOST_IDS) {
      const boost = BOOSTS[id];
      const text = `${boost.name} ${boost.description}`.toLocaleLowerCase();
      for (const word of ["answer", "explanation", "question", "skip"]) {
        expect(text).not.toContain(word);
      }
    }
  });

  it("lets a reader earn helps by reading rather than paying", () => {
    // The economy has to work for someone who never spends anything, or the
    // helps are a paywall with extra steps.
    expect(boostsEarnedForRound(7, 7).length).toBeGreaterThan(0);
    expect(boostsEarnedForRound(4, 7).length).toBeGreaterThan(0);
    expect(boostsEarnedForRound(0, 7)).toEqual([]);
  });

  it("spends a help only when it has one", () => {
    const inventory = grantBoost(EMPTY_INVENTORY, "hint", 1);
    expect(spendBoost(inventory, "hint")?.hint).toBe(0);
    expect(spendBoost(EMPTY_INVENTORY, "hint")).toBeNull();
    expect(sanitizeInventory({ hint: -1 })).toBeNull();
    expect(sanitizeInventory({ "level-skip": 3 })).toBeNull();
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

describe("BibleQuest Arcade surface", () => {
  const screen = readFileSync("src/components/games/GamesScreen.tsx", "utf8");
  const card = readFileSync("src/components/games/ArcadeGameCard.tsx", "utf8");
  const formation = readFileSync(
    "src/components/home/TodayFormation.tsx",
    "utf8",
  );

  it("calls itself the arcade everywhere a reader can see", () => {
    for (const source of [screen, formation]) {
      expect(source).not.toContain("Scripture Games");
    }
    expect(screen).toContain("BibleQuest Arcade");
    expect(formation).toContain("BibleQuest Arcade");
  });

  it("offers a way back to Home", () => {
    // The arcade has no nav tab, so without this the only exit was a browser
    // gesture or a tab that lands somewhere else entirely.
    expect(screen).toContain('href="/app"');
    expect(screen).toContain("IconArrowLeft");
  });

  it("draws Home and the arcade from one card", () => {
    // Two copies of the same art card drift apart; this one is shared.
    expect(formation).toContain("ArcadeGameCard");
    expect(screen).toContain("ArcadeGameCard");
    expect(card).toContain("export const ARCADE_ART");
    expect(formation).not.toContain("const GAME_ART");
  });
});

describe("Seven Days Match cascade frames", () => {
  it("hands the surface every wave, not just the result", () => {
    // The engine resolves a whole cascade in one call, which is right for the
    // rules and wrong for the eye: tiles would leave and arrive in the same
    // frame, and a four-deep cascade would look like a single match.
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
    const result = trySwap(session, pair![0], pair![1]);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.swapped).toBeDefined();
    result.steps.forEach((step, position) => {
      expect(step.cascade).toBe(position + 1);
      expect(step.matched.size).toBeGreaterThanOrEqual(3);
      // The emptied frame must actually have holes, or there is nothing to see.
      expect(step.emptied.cells.some((cell) => cell === null)).toBe(true);
      // And the settled frame must have none left.
      expect(step.settled.cells.every((cell) => cell !== null)).toBe(true);
    });
    // The last settled frame is where the move actually lands.
    expect(result.steps[result.steps.length - 1].settled.cells).toEqual(
      result.session.state.board.cells,
    );
  });

  it("shows a rejected swap before taking it back", () => {
    const session = startLevel(SEVEN_DAYS_LEVELS[0]);
    const { board: grid } = session.state;
    let pair: [number, number] | null = null;
    for (let index = 0; index < grid.cells.length - 1 && !pair; index += 1) {
      const right = index + 1;
      if (!areAdjacent(grid, index, right)) continue;
      if (findMatches(swapCells(grid, index, right)).size === 0) {
        pair = [index, right];
      }
    }
    const result = trySwap(session, pair![0], pair![1]);
    expect(result.rejected).toBe(true);
    // The traded frame is what makes it read as "not that" rather than as a
    // tap that did nothing at all.
    expect(result.swapped).toBeDefined();
    expect(result.steps).toHaveLength(0);
    expect(result.session.state.board.cells).toEqual(grid.cells);
  });
});
