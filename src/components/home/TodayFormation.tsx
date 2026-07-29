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

/** Gives today's complete free guide visual priority over the lighter game. */
export function TodayFormation({ dayKey }: { dayKey: string }) {
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

  return (
    <section aria-labelledby="today-formation-title">
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-caption uppercase tracking-[0.12em] text-ash">
            A gentle next step
          </p>
          <h2
            id="today-formation-title"
            className="mt-0.5 font-pixel text-[1.25rem] uppercase tracking-[0.05em] text-accent"
          >
            For today
          </h2>
        </div>
        {GREEN_FEATURES.pilgrimages && (
          <Link
            href="/app/pilgrimages"
            className="inline-flex min-h-11 items-center text-caption font-medium text-accent"
          >
            Pilgrimages
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {GREEN_FEATURES.guidedScripture && (
          <Link href="/app/guided/daily" className="block">
            <PaperCard
              interactive
              variant="atmospheric"
              padding="md"
              className="h-full"
            >
              <div className="flex items-start gap-3">
                <PixelIcon name="open-book" size={4} />
                <div className="min-w-0 flex-1">
                  <p className="text-caption uppercase tracking-[0.1em] text-accent">
                    Guided Scripture · Free
                  </p>
                  <h3 className="mt-1 font-display text-[1.25rem] leading-tight text-graphite">
                    {guide.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-small leading-relaxed text-charcoal">
                    {guide.summary}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-caption text-ash">
                    <IconClock size={14} /> About {guide.durationMinutes} minutes
                  </p>
                  {guideProgress && (
                    <p className="mt-2 text-caption text-ash">
                      {guideProgress.completedAt
                        ? "Guide complete"
                        : `${guidedProgressPercent(guideProgress)}% through six movements`}
                    </p>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1 text-small font-medium text-accent">
                    {guideAction} <IconArrowRight size={14} />
                  </span>
                </div>
              </div>
            </PaperCard>
          </Link>
        )}

        {game && (
          <Link href="/app/games" className="block">
            <PaperCard
              interactive
              variant="paper"
              padding="md"
              className="h-full"
            >
              <div className="flex items-start gap-3">
                <PixelIcon
                  name={game.kind === "connections" ? "links" : "path"}
                  size={4}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-caption uppercase tracking-[0.1em] text-accent">
                    Today’s game · Free
                  </p>
                  <h3 className="mt-1 font-display text-[1.25rem] leading-tight text-graphite">
                    {game.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-small leading-relaxed text-charcoal">
                    {game.description}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-caption text-ash">
                    <IconClock size={14} /> About {game.estimatedMinutes} minutes
                    · no timer
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-small font-medium text-accent">
                    {gameAction} <IconArrowRight size={14} />
                  </span>
                </div>
              </div>
            </PaperCard>
          </Link>
        )}
      </div>
    </section>
  );
}
