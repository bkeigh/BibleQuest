"use client";

import Link from "next/link";
import { useMemo } from "react";
import { guidedScriptureForDate } from "@/data/guided/content";
import { getDailyGameSnapshot } from "@/lib/games/daily-status";
import { GREEN_FEATURES } from "@/lib/features/green";
import {
  guidedProgressPercent,
  makeGuidedSessionKey,
} from "@/lib/guided/progress";
import { useQuestOS } from "@/lib/questos/store";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import {
  IconArrowRight,
  IconClock,
} from "@/components/design-system/icons";

type FormationSection = "all" | "guide" | "game";

/** Renders the requested daily formation sections without changing their progress model. */
export function TodayFormation({
  dayKey,
  show = "all",
}: {
  dayKey: string;
  show?: FormationSection;
}) {
  const guide = useMemo(() => guidedScriptureForDate(dayKey), [dayKey]);
  const guideKey = useMemo(
    () => makeGuidedSessionKey("daily", guide.id, dayKey),
    [dayKey, guide.id],
  );
  const guideProgress = useQuestOS(
    (state) => state.guidedProgress[guideKey],
  );
  // Parent screens hydrate before mounting this card, so the local resume read
  // never enters the server-rendered tree.
  const gameSnapshot = useMemo(
    () => getDailyGameSnapshot(dayKey, GREEN_FEATURES),
    [dayKey],
  );
  const game = gameSnapshot.puzzle;

  if (!GREEN_FEATURES.guidedScripture && !game) return null;

  const guideAction = guideProgress?.completedAt
    ? "Return to today’s guide"
    : guideProgress
      ? "Resume today’s guide"
      : "Start today’s guide";
  const gameAction = gameSnapshot.actionLabel;
  const showGuide =
    GREEN_FEATURES.guidedScripture && (show === "all" || show === "guide");
  const showGame = Boolean(game) && (show === "all" || show === "game");

  return (
    <>
      {showGuide && (
        <section aria-labelledby="guided-scripture-home-title">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
            <div className="flex shrink-0 items-baseline gap-x-2 whitespace-nowrap sm:gap-x-3">
              <h2
                id="guided-scripture-home-title"
                className="font-pixel text-[1.25rem] uppercase tracking-[0.05em] text-accent"
              >
                Guided Scripture
              </h2>
              <p className="text-[0.625rem] uppercase tracking-[0.08em] text-ash sm:text-caption sm:tracking-[0.12em]">
                Read slowly
              </p>
            </div>
            {GREEN_FEATURES.pilgrimages && (
              <Link
                href="/app/pilgrimages"
                className="inline-flex min-h-12 items-center px-1 text-caption font-medium text-accent"
              >
                Pilgrimages
              </Link>
            )}
          </div>
          <Link href="/app/guided/daily" className="block">
            <PaperCard
              interactive
              variant="atmospheric"
              padding="md"
              className="h-full min-h-48"
            >
              <div className="flex items-start gap-3">
                <PixelIcon name="open-book" size={4} />
                <div className="min-w-0 flex-1">
                  <p className="text-caption uppercase tracking-[0.1em] text-accent">
                    Today’s guide
                  </p>
                  <h3 className="mt-1 font-display text-[1.25rem] leading-tight text-graphite">
                    {guide.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-small leading-relaxed text-charcoal">
                    {guide.summary}
                  </p>
                  {guideProgress && (
                    <p className="mt-3 text-caption text-ash">
                      {guideProgress.completedAt
                        ? "Guide complete"
                        : `${guidedProgressPercent(guideProgress)}% through six movements`}
                    </p>
                  )}
                  {/* Keep timing and action visually separate at every width. */}
                  <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="inline-flex items-center gap-1.5 text-caption text-ash">
                      <IconClock size={14} /> About {guide.durationMinutes}{" "}
                      minutes
                    </p>
                    <span className="inline-flex min-h-12 items-center gap-1.5 rounded-[10px] bg-paper/70 px-4 py-2 text-small font-medium text-accent ring-1 ring-mist/80">
                      {guideAction} <IconArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
            </PaperCard>
          </Link>
        </section>
      )}

      {showGame && game && (
        <section aria-labelledby="scripture-games-home-title">
          <div className="mb-2.5 flex items-baseline gap-x-2 whitespace-nowrap px-1 sm:gap-x-3">
            <h2
              id="scripture-games-home-title"
              className="font-pixel text-[1.25rem] uppercase tracking-[0.05em] text-accent"
            >
              Scripture Games
            </h2>
            <p className="text-[0.625rem] uppercase tracking-[0.08em] text-ash sm:text-caption sm:tracking-[0.12em]">
              Learn by playing
            </p>
          </div>
          <Link href="/app/games" className="block">
            <PaperCard
              interactive
              variant="paper"
              padding="md"
              className="h-full min-h-48"
            >
              <div className="flex items-start gap-3">
                <PixelIcon
                  name={game.kind === "connections" ? "links" : "path"}
                  size={4}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-caption uppercase tracking-[0.1em] text-accent">
                    Today’s game
                  </p>
                  <h3 className="mt-1 font-display text-[1.25rem] leading-tight text-graphite">
                    {game.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-small leading-relaxed text-charcoal">
                    {game.description}
                  </p>
                  {/* Keep timing and action visually separate at every width. */}
                  <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="inline-flex items-center gap-1.5 text-caption text-ash">
                      <IconClock size={14} /> About {game.estimatedMinutes}{" "}
                      minutes · no timer
                    </p>
                    <span className="inline-flex min-h-12 items-center gap-1.5 rounded-[10px] bg-linen px-4 py-2 text-small font-medium text-accent ring-1 ring-mist">
                      {gameAction} <IconArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
            </PaperCard>
          </Link>
        </section>
      )}
    </>
  );
}
