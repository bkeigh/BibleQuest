import { beforeEach, describe, expect, it } from "vitest";
import { connectionPuzzles } from "@/data/games";
import { createConnectionsProgress } from "@/lib/games/engine";
import {
  GAME_STORAGE_KEY,
  GAME_STORAGE_VERSION,
  MAX_STORED_GAME_SESSIONS,
  clearGameProgress,
  readGameProgress,
  writeGameProgress,
} from "@/lib/games/storage";

describe("device-local Scripture game progress", () => {
  beforeEach(() => window.localStorage.clear());

  it("resumes the exact puzzle content version locally", () => {
    const puzzle = connectionPuzzles[0];
    const progress = createConnectionsProgress(puzzle, "2026-08-01:test", 10);
    expect(writeGameProgress(progress, puzzle)).toBe(true);
    expect(readGameProgress(puzzle, progress.sessionKey)).toEqual(progress);
  });

  it("purges malformed or stale-version envelopes", () => {
    window.localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ version: GAME_STORAGE_VERSION + 1, entries: [] }),
    );
    expect(readGameProgress(connectionPuzzles[0], "missing")).toBeNull();
    expect(window.localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
  });

  it("degrades to no resume when browser storage is unavailable", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;

    expect(
      readGameProgress(connectionPuzzles[0], "missing", unavailable),
    ).toBeNull();
  });

  it("reports unavailable persistence instead of pretending resume was saved", () => {
    const puzzle = connectionPuzzles[0];
    const progress = createConnectionsProgress(puzzle, "2026-08-01:test", 10);
    const unavailable = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;

    expect(writeGameProgress(progress, puzzle, unavailable)).toBe(false);
  });

  it("bounds retained sessions without touching unrelated local data", () => {
    const puzzle = connectionPuzzles[0];
    window.localStorage.setItem("biblequest:unrelated", "keep");
    for (let index = 0; index < MAX_STORED_GAME_SESSIONS + 5; index += 1) {
      const progress = createConnectionsProgress(
        puzzle,
        `2026-08-${String(index + 1).padStart(2, "0")}:${puzzle.id}`,
        index + 1,
      );
      expect(writeGameProgress(progress, puzzle)).toBe(true);
    }
    const stored = JSON.parse(window.localStorage.getItem(GAME_STORAGE_KEY)!);
    expect(stored.entries).toHaveLength(MAX_STORED_GAME_SESSIONS);
    expect(stored.entries[0].updatedAt).toBe(MAX_STORED_GAME_SESSIONS + 5);
    expect(window.localStorage.getItem("biblequest:unrelated")).toBe("keep");
  });

  it("rejects progress whose content no longer matches the reviewed puzzle", () => {
    const puzzle = connectionPuzzles[0];
    const progress = createConnectionsProgress(puzzle, "2026-08-01:test", 10);
    window.localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({
        version: GAME_STORAGE_VERSION,
        entries: [{ ...progress, contentVersion: puzzle.contentVersion + 1 }],
      }),
    );
    expect(readGameProgress(puzzle, progress.sessionKey)).toBeNull();
  });

  it("rejects duplicate selections and impossible completed state", () => {
    const puzzle = connectionPuzzles[0];
    const progress = createConnectionsProgress(puzzle, "2026-08-01:test", 10);
    window.localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({
        version: GAME_STORAGE_VERSION,
        entries: [
          {
            ...progress,
            status: "completed",
            selectedTerms: [progress.termOrder[0], progress.termOrder[0]],
            solvedGroupIds: [puzzle.groups[0].id],
          },
        ],
      }),
    );
    expect(readGameProgress(puzzle, progress.sessionKey)).toBeNull();
  });

  it("rejects excessive misses instead of restoring impossible progress", () => {
    const puzzle = connectionPuzzles[0];
    const progress = createConnectionsProgress(puzzle, "2026-08-01:test", 10);
    window.localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({
        version: GAME_STORAGE_VERSION,
        entries: [{ ...progress, misses: 99 }],
      }),
    );
    expect(readGameProgress(puzzle, progress.sessionKey)).toBeNull();
  });

  it("rejects future-poisoned clocks and impossible analytics markers", () => {
    const puzzle = connectionPuzzles[0];
    const progress = createConnectionsProgress(puzzle, "2026-08-01:test", 10);
    window.localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({
        version: GAME_STORAGE_VERSION,
        entries: [
          {
            ...progress,
            learningEventRecorded: true,
            updatedAt: Date.now() + 24 * 60 * 60 * 1000,
          },
        ],
      }),
    );
    expect(readGameProgress(puzzle, progress.sessionKey)).toBeNull();
  });

  it("clears game progress for Settings without touching unrelated data", () => {
    const puzzle = connectionPuzzles[0];
    const progress = createConnectionsProgress(puzzle, "2026-08-01:test", 10);
    writeGameProgress(progress, puzzle);
    window.localStorage.setItem("biblequest:unrelated", "keep");

    expect(clearGameProgress()).toBe(true);
    expect(window.localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("biblequest:unrelated")).toBe("keep");
  });
});
