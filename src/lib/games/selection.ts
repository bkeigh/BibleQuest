import { connectionPuzzles, timelinePuzzles } from "@/data/games";
import { dateKeyOrdinal, isValidDateKey } from "@/lib/utils/dates";
import type { GameKind, GamePuzzle } from "./types";

export interface DailyGameAvailability {
  games: boolean;
  scriptureConnections: boolean;
  bibleTimeline: boolean;
}

/** Returns the enabled formats in their stable alternating order. */
export function enabledGameKinds(
  availability: DailyGameAvailability,
): GameKind[] {
  if (!availability.games) return [];
  return [
    ...(availability.scriptureConnections ? (["connections"] as const) : []),
    ...(availability.bibleTimeline ? (["timeline"] as const) : []),
  ];
}

/** Selects exactly one free daily puzzle, stable across devices and reloads. */
export function selectDailyGame(
  dateKey: string,
  availability: DailyGameAvailability,
): GamePuzzle | null {
  const kinds = enabledGameKinds(availability);
  if (kinds.length === 0) return null;
  const ordinal = dateKeyOrdinal(dateKey);
  const kind = kinds[((ordinal % kinds.length) + kinds.length) % kinds.length];
  const pool = kind === "connections" ? connectionPuzzles : timelinePuzzles;
  const round = Math.floor(ordinal / kinds.length);
  return pool[((round % pool.length) + pool.length) % pool.length];
}

/** A session key separates repeat appearances without storing user identity. */
export function dailyGameSessionKey(dateKey: string, puzzleId: string): string {
  if (!isValidDateKey(dateKey)) throw new Error(`Invalid game date key: ${dateKey}`);
  return `${dateKey}:${puzzleId}`;
}
