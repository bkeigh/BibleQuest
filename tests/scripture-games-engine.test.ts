import { describe, expect, it } from "vitest";
import { connectionPuzzles, timelinePuzzles } from "@/data/games";
import {
  CONNECTIONS_REVEAL_AFTER,
  TIMELINE_REVEAL_AFTER,
  chooseTimelineItem,
  createConnectionsProgress,
  createTimelineProgress,
  moveTimelineItem,
  submitConnections,
  submitTimeline,
  toggleConnectionTerm,
} from "@/lib/games/engine";

describe("Scripture game engines", () => {
  it("gathers a Connections group without mutating the previous state", () => {
    const puzzle = connectionPuzzles[0];
    const initial = createConnectionsProgress(puzzle, "2026-08-01:test", 1);
    const available = new Set(initial.termOrder);
    const selected = puzzle.groups[0].terms.reduce(
      (progress, term) =>
        toggleConnectionTerm(progress, term, available, progress.updatedAt + 1),
      initial,
    );
    const result = submitConnections(puzzle, selected, 10);

    expect(result.progress.solvedGroupIds).toEqual([puzzle.groups[0].id]);
    expect(result.progress.selectedTerms).toEqual([]);
    expect(initial.solvedGroupIds).toEqual([]);
    expect(result.announcement).toContain(puzzle.groups[0].title);
  });

  it("offers near-match guidance and reveals sourced answers after four misses", () => {
    const puzzle = connectionPuzzles[0];
    let progress = createConnectionsProgress(puzzle, "2026-08-02:test", 1);
    const nearTerms = [
      ...puzzle.groups[0].terms.slice(0, 3),
      puzzle.groups[1].terms[0],
    ];
    for (const term of nearTerms) {
      progress = toggleConnectionTerm(
        progress,
        term,
        new Set(progress.termOrder),
        2,
      );
    }
    const near = submitConnections(puzzle, progress, 3);
    expect(near.nearMatch).toBe(true);

    progress = near.progress;
    for (let miss = 1; miss < CONNECTIONS_REVEAL_AFTER; miss += 1) {
      for (const term of nearTerms) {
        progress = toggleConnectionTerm(
          progress,
          term,
          new Set(progress.termOrder),
          4 + miss,
        );
      }
      progress = submitConnections(puzzle, progress, 10 + miss).progress;
    }
    expect(progress.status).toBe("revealed");
    expect(progress.misses).toBe(CONNECTIONS_REVEAL_AFTER);
  });

  it("reorders a timeline through explicit, non-drag movement", () => {
    const puzzle = timelinePuzzles[0];
    const initial = createTimelineProgress(puzzle, "2026-08-01:test", 1);
    const itemId = initial.itemOrder[1];
    const moved = moveTimelineItem(initial, itemId, "up", 2);

    expect(moved.itemOrder[0]).toBe(itemId);
    expect(initial.itemOrder[1]).toBe(itemId);
  });

  it("lets a young reader build the story one correct tap at a time", () => {
    const puzzle = timelinePuzzles[0];
    let progress = createTimelineProgress(puzzle, "simple-taps", 1);

    for (const item of puzzle.items) {
      const result = chooseTimelineItem(puzzle, progress, item.id, 2);
      progress = result.progress;
    }

    expect(progress.selectedItemIds).toEqual(
      puzzle.items.map((item) => item.id),
    );
    expect(progress.status).toBe("completed");
  });

  it("gives a direct hint and reveals after three wrong taps", () => {
    const puzzle = timelinePuzzles[0];
    let progress = createTimelineProgress(puzzle, "gentle-hints", 1);
    const wrong = puzzle.items[1].id;

    const first = chooseTimelineItem(puzzle, progress, wrong, 2);
    expect(first.announcement).toContain("Try a different");
    const second = chooseTimelineItem(puzzle, first.progress, wrong, 3);
    expect(second.announcement).toContain("Hint:");
    const third = chooseTimelineItem(puzzle, second.progress, wrong, 4);
    progress = third.progress;

    expect(progress.status).toBe("revealed");
    expect(progress.selectedItemIds).toEqual(
      puzzle.items.map((item) => item.id),
    );
  });

  it("completes correct narrative order and reveals after three checks", () => {
    const puzzle = timelinePuzzles[0];
    const correct = {
      ...createTimelineProgress(puzzle, "correct", 1),
      itemOrder: puzzle.items.map((item) => item.id),
    };
    expect(submitTimeline(puzzle, correct, 2).progress.status).toBe("completed");

    let progress = createTimelineProgress(puzzle, "incorrect", 1);
    for (let miss = 0; miss < TIMELINE_REVEAL_AFTER; miss += 1) {
      progress = submitTimeline(puzzle, progress, 2 + miss).progress;
    }
    expect(progress.status).toBe("revealed");
    expect(progress.itemOrder).toEqual(puzzle.items.map((item) => item.id));
  });
});
