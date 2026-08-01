"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
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
  ARCADE_ART,
  ArcadeGameCard,
} from "@/components/games/ArcadeGameCard";
import {
  IconArrowLeft,
  IconArrowRight,
  IconClock,
} from "@/components/design-system/icons";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";

type FormationSection = "all" | "guide" | "game";

// Every rail item shares one width so the cards read as a single set, and
// `h-full` lets each card stretch to the tallest card in the row.
const GAME_RAIL_ITEM = "w-[86%] shrink-0 snap-start sm:w-[70%]";

/** Renders the requested daily formation sections without changing their progress model. */
export function TodayFormation({
  dayKey,
  show = "all",
  afterGuide,
}: {
  dayKey: string;
  show?: FormationSection;
  afterGuide?: React.ReactNode;
}) {
  const guide = useMemo(() => guidedScriptureForDate(dayKey), [dayKey]);
  const shouldReduceMotion = useShouldReduceMotion();
  const gameRailRef = useRef<HTMLDivElement>(null);
  const [gameRailEdges, setGameRailEdges] = useState({
    atStart: true,
    atEnd: false,
  });
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

  // Scrolls by most of one viewport so the following card stays recognizable.
  function scrollGameRail(direction: -1 | 1) {
    const rail = gameRailRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * Math.max(240, rail.clientWidth * 0.82),
      behavior: shouldReduceMotion ? "auto" : "smooth",
    });
  }

  // Keeps the arrow states truthful for buttons, touch, mouse, and trackpads.
  function updateGameRailEdges() {
    const rail = gameRailRef.current;
    if (!rail) return;
    // Includes the rail's inset padding so the first snap point stays disabled.
    const edgeTolerance = 24;
    const next = {
      atStart: rail.scrollLeft <= edgeTolerance,
      atEnd:
        rail.scrollLeft + rail.clientWidth >=
        rail.scrollWidth - edgeTolerance,
    };
    setGameRailEdges((current) =>
      current.atStart === next.atStart &&
      current.atEnd === next.atEnd
        ? current
        : next,
    );
  }

  return (
    <>
      {showGuide && (
        <section aria-labelledby="guided-scripture-home-title">
          <HomeSectionHeading
            id="guided-scripture-home-title"
            title="Guided Scripture"
            subtitle="Read slowly"
            action={
              GREEN_FEATURES.pilgrimages ? (
                <Link
                  href="/app/pilgrimages"
                  className="inline-flex min-h-11 items-center px-1 text-caption font-medium text-accent"
                >
                  Pilgrimages
                </Link>
              ) : null
            }
          />
          <Link href="/app/guided/daily" className="block">
            <PaperCard
              interactive
              variant="atmospheric"
              padding="md"
              className="h-full min-h-48"
            >
              <div className="flex items-start gap-3">
                <PixelIcon name="open-book" size={68} />
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
          {afterGuide && <div className="mt-4">{afterGuide}</div>}
        </section>
      )}

      {showGame && game && (
        <section aria-labelledby="arcade-home-title">
          <HomeSectionHeading
            id="arcade-home-title"
            title="BibleQuest Arcade"
            subtitle="Learn by playing"
            action={
              // Games have no nav tab by design, so this rail is the entry to
              // the whole surface. A real link beats a "scroll to explore"
              // hint that was also hidden on the phones most readers use.
              <Link
                href="/app/games"
                className="-m-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-button)] p-2 text-caption font-medium text-accent transition-colors hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                All games <IconArrowRight size={14} />
              </Link>
            }
          />
          <div className="relative">
            {/* The rail previews future game space without presenting unfinished actions. */}
            <div
              ref={gameRailRef}
              role="list"
              aria-label="BibleQuest Arcade games"
              onScroll={updateGameRailEdges}
              className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {GREEN_FEATURES.sevenDaysMatch && (
                <div role="listitem" className={GAME_RAIL_ITEM}>
                  <Link
                    href="/app/games/seven-days"
                    className="group block h-full rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <ArcadeGameCard
                      image={ARCADE_ART.sevenDays}
                      eyebrow="Play any time"
                      title="Seven Days Match"
                      description="Match three, answer a Bible question, and open the next level across creation’s seven-day story."
                      icon="crown"
                      footer={
                        <>
                          <span>7 days · 7 levels each</span>
                          <span className="inline-flex items-center gap-1.5 font-medium text-white">
                            Play <IconArrowRight size={14} />
                          </span>
                        </>
                      }
                    />
                  </Link>
                </div>
              )}
              <div role="listitem" className={GAME_RAIL_ITEM}>
                <Link
                  href="/app/games"
                  className="group block h-full rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <ArcadeGameCard
                    image={ARCADE_ART.today}
                    eyebrow="Today’s game"
                    title={game.title}
                    description={game.description}
                    icon={game.kind === "connections" ? "links" : "path"}
                    footer={
                      <>
                        <span className="inline-flex items-center gap-1.5">
                          <IconClock size={14} /> About {game.estimatedMinutes}{" "}
                          minutes
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-medium text-white">
                          {gameAction} <IconArrowRight size={14} />
                        </span>
                      </>
                    }
                  />
                </Link>
              </div>
              <div role="listitem" className={GAME_RAIL_ITEM}>
                <ArcadeGameCard
                  image={ARCADE_ART.archive}
                  eyebrow="Game preview"
                  title="Miracle Journey"
                  description="Place Gospel moments in order and follow the disciples through seven story scenes."
                  icon="open-book"
                  footer={
                    <>
                      <span>Story path · 7 scenes</span>
                      <span className="font-medium text-white">
                        Matthew 14:22–33
                      </span>
                    </>
                  }
                  muted
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => scrollGameRail(-1)}
              disabled={gameRailEdges.atStart}
              aria-label="Previous arcade game"
              className="absolute -left-5 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-paper/90 text-accent paper-shadow backdrop-blur-md transition-opacity disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:-left-8"
            >
              <IconArrowLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => scrollGameRail(1)}
              disabled={gameRailEdges.atEnd}
              aria-label="Next arcade game"
              className="absolute -right-5 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-paper/90 text-accent paper-shadow backdrop-blur-md transition-opacity disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:-right-8"
            >
              <IconArrowRight size={17} />
            </button>
          </div>
        </section>
      )}
    </>
  );
}
