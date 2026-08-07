import type { GamePuzzle, ScriptureSource } from "./types";
import { chapterHref } from "@/lib/bible/links";

export const GAME_ROUTES = Object.freeze({
  today: "/app/games",
  archive: "/app/games/archive",
});

/** Produces the canonical internal route for one reviewed archive puzzle. */
export function archivedGameHref(puzzleId: string): string {
  return `${GAME_ROUTES.archive}/${encodeURIComponent(puzzleId)}`;
}

/** Opens the exact cited range in the existing accessible chapter reader. */
export function scriptureSourceHref(source: ScriptureSource): string {
  const range =
    source.verseEnd && source.verseEnd !== source.verseStart
      ? `${source.verseStart}-${source.verseEnd}`
      : String(source.verseStart);
  return chapterHref(source.bookSlug, source.chapter, {
    verse: range,
    anchor: source.verseStart,
  });
}

/** Shares discovery, never answers, misses, identity, or spiritual activity. */
export function gameShareText(puzzle: GamePuzzle): string {
  const kind =
    puzzle.kind === "connections"
      ? "Scripture Connections"
      : "Bible Timeline";
  return `I explored a ${kind} study in BibleQuest: ${puzzle.learning.title}. Read, notice, and carry one thing with you.`;
}
