import { IconClock } from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import type { GamePuzzle } from "@/lib/games/types";

/** Shared calm frame keeps both games legible and consistent. */
export function GameShell({
  puzzle,
  context = "today",
  children,
}: {
  puzzle: GamePuzzle;
  context?: "today" | "archive";
  children: React.ReactNode;
}) {
  return (
    <article aria-labelledby="daily-game-title">
      <PaperCard variant="atmospheric" padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-pixel text-[0.9375rem] uppercase tracking-[0.06em] text-accent">
            {context === "today" ? "Today’s game" : "Archive study · Plus"}
          </p>
          <p className="inline-flex items-center gap-1.5 text-caption text-ash">
            <IconClock size={16} />
            About {puzzle.estimatedMinutes} minutes · no timer
          </p>
        </div>
        <h2
          id="daily-game-title"
          className="mt-4 font-display text-[1.75rem] leading-tight text-graphite"
        >
          {puzzle.title}
        </h2>
        <p className="mt-2 max-w-xl text-body text-charcoal">
          {puzzle.description}
        </p>
        <p className="mt-3 text-small text-ash">
          A quiet Scripture study. It does not change your Journey, candle, or
          quest progress.
        </p>
      </PaperCard>
      <div className="mt-5">{children}</div>
    </article>
  );
}
