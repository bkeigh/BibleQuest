import { GAME_ROUTES } from "./links";
import {
  dailyGameSessionKey,
  selectDailyGame,
  type DailyGameAvailability,
} from "./selection";
import { readGameProgress } from "./storage";
import type { GamePuzzle, GameStatus } from "./types";

export interface DailyGameSnapshot {
  href: typeof GAME_ROUTES.today;
  puzzle: GamePuzzle | null;
  sessionKey: string | null;
  status: GameStatus | "new" | "unavailable";
  actionLabel: "Start game" | "Resume game" | "Review learning" | null;
}

/** Read-only integration API for Home/Bible cards after client hydration. */
export function getDailyGameSnapshot(
  dateKey: string,
  availability: DailyGameAvailability,
  storage?: Storage,
): DailyGameSnapshot {
  const puzzle = selectDailyGame(dateKey, availability);
  if (!puzzle) {
    return {
      href: GAME_ROUTES.today,
      puzzle: null,
      sessionKey: null,
      status: "unavailable",
      actionLabel: null,
    };
  }
  const sessionKey = dailyGameSessionKey(dateKey, puzzle.id);
  const progress = readGameProgress(puzzle, sessionKey, storage);
  const status = progress?.status ?? "new";
  return {
    href: GAME_ROUTES.today,
    puzzle,
    sessionKey,
    status,
    actionLabel:
      status === "playing"
        ? "Resume game"
        : status === "completed" || status === "revealed"
          ? "Review learning"
          : "Start game",
  };
}
