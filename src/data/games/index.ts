import { assertValidGameCatalog } from "@/lib/games/validation";
import type { GamePuzzle } from "@/lib/games/types";
import { connectionPuzzles } from "./connections";
import { timelinePuzzles } from "./timelines";

export { connectionPuzzles } from "./connections";
export { timelinePuzzles } from "./timelines";

/** One immutable, human-reviewed catalog feeds selection, play, and QA. */
export const gamePuzzles: readonly GamePuzzle[] = [
  ...connectionPuzzles,
  ...timelinePuzzles,
];

export const gamePuzzleById = new Map(
  gamePuzzles.map((puzzle) => [puzzle.id, puzzle]),
);

// A bad content handoff must stop the build instead of reaching a daily slot.
assertValidGameCatalog(gamePuzzles);
