"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import {
  GentleButton,
  GentleLink,
} from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import {
  IconArrowLeft,
  IconArrowRight,
  IconClock,
} from "@/components/design-system/icons";
import { PlusFeatureDialog } from "@/components/plus/PlusFeatureDialog";
import { usePlus } from "@/lib/billing/usePlus";
import { GREEN_FEATURES } from "@/lib/features/green";
import {
  dailyGameSessionKey,
  selectDailyGame,
} from "@/lib/games/selection";
import { readGameProgress } from "@/lib/games/storage";
import type { GameStatus } from "@/lib/games/types";
import { SEVEN_DAYS_LEVELS } from "@/lib/games/seven-days/levels";
import {
  nextLevel,
  readSevenDaysProgress,
  summarize,
} from "@/lib/games/seven-days/progress";
import { toDateKey } from "@/lib/utils/dates";
import { useHydrated } from "@/lib/utils/useHydrated";
import { track } from "@/lib/analytics/events";
import { ARCADE_ART, ArcadeGameCard } from "./ArcadeGameCard";
import { ConnectionsGame } from "./ConnectionsGame";
import { GameShell } from "./GameShell";
import { TimelineGame } from "./TimelineGame";

function useLocalDayKey(): string | null {
  const [dayKey, setDayKey] = useState<string | null>(null);
  useEffect(() => {
    function refresh() {
      const next = toDateKey();
      setDayKey((current) => (current === next ? current : next));
    }
    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return dayKey;
}

/** BibleQuest Arcade: the games hub, with today's study inside it. */
export function GamesScreen() {
  const dayKey = useLocalDayKey();
  const puzzle = dayKey ? selectDailyGame(dayKey, GREEN_FEATURES) : null;
  const plus = usePlus();
  const [plusDialogOpen, setPlusDialogOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="BibleQuest Arcade"
        subtitle="Play through Scripture. Learn something at every step."
      />
      <PageContainer className="pb-8 pt-2">
        {/* The arcade has no nav tab, so it needs its own way back — without
            one, the only exit was the browser gesture or a tab that drops you
            somewhere else entirely. */}
        <Link
          href="/app"
          className="-ms-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-small text-ash transition-colors hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IconArrowLeft size={16} /> Home
        </Link>

        {!GREEN_FEATURES.games ? (
          <PaperCard variant="quiet" padding="lg" className="mt-3">
            <h2 className="font-display text-subheading text-graphite">
              The arcade is resting
            </h2>
            <p className="mt-2 text-body text-charcoal">
              This feature is temporarily unavailable. The Bible, prayers, and
              quests remain ready.
            </p>
            <GentleLink href="/app/bible" variant="outline" className="mt-5">
              Open the Bible
            </GentleLink>
          </PaperCard>
        ) : (
          <div className="mt-3 space-y-4">
            {GREEN_FEATURES.sevenDaysMatch && <SevenDaysArcadeCard />}
            <TodaysGameCard dayKey={dayKey} puzzle={puzzle} />
            <Link
              href="/app/games/store"
              className="group block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <PaperCard variant="paper" padding="md" interactive>
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="shrink-0">
                    <PixelIcon name="service-basket" size={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-subheading text-graphite">
                      Arcade Store
                    </span>
                    <span className="block text-small leading-relaxed text-ash">
                      More days to play and helps for the board. Answers stay
                      free.
                    </span>
                  </span>
                  <IconArrowRight size={16} className="shrink-0 text-accent" />
                </div>
              </PaperCard>
            </Link>
            <ArchiveCard
              loading={plus.loading}
              isPlus={plus.isPlus}
              onExplorePlus={() => setPlusDialogOpen(true)}
            />
          </div>
        )}

        {/* Today's study still plays inline, below the shelf that leads to it. */}
        {GREEN_FEATURES.games && dayKey && puzzle && (
          <div id="todays-game" className="mt-8 scroll-mt-4">
            <GameShell puzzle={puzzle}>
              <DailyGameEntry
                key={dailyGameSessionKey(dayKey, puzzle.id)}
                puzzle={puzzle}
                sessionKey={dailyGameSessionKey(dayKey, puzzle.id)}
              />
            </GameShell>
          </div>
        )}

        <PlusFeatureDialog
          open={plusDialogOpen}
          onClose={() => setPlusDialogOpen(false)}
          title="Revisit arcade studies"
          description="The game archive and themed collections are included with BibleQuest Plus. Today’s complete game remains available here."
        />
      </PageContainer>
    </>
  );
}

/** Seven Days Match leads: the one game a reader can pick up whenever they like. */
function SevenDaysArcadeCard() {
  const hydrated = useHydrated();
  const progress = hydrated ? readSevenDaysProgress() : null;
  const summary = progress ? summarize(progress) : null;
  const resume = progress ? nextLevel(progress) : SEVEN_DAYS_LEVELS[0];
  const started = Boolean(summary && summary.cleared > 0);

  return (
    <Link
      href="/app/games/seven-days"
      className="group block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArcadeGameCard
        image={ARCADE_ART.sevenDays}
        eyebrow="Play any time"
        title="Seven Days Match"
        description="Match three across creation’s seven-day story, with a question from the passage at every level."
        icon="crown"
        footer={
          <>
            <span>
              {summary
                ? `${summary.cleared}/${summary.total} levels · ${summary.daysOpened}/7 days`
                : "7 days · 7 levels each"}
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-white">
              {started
                ? `Continue · Day ${resume.day}, Level ${resume.level}`
                : "Play"}{" "}
              <IconArrowRight size={14} />
            </span>
          </>
        }
      />
    </Link>
  );
}

/** Today's rotating study, as a card that leads down to the board itself. */
function TodaysGameCard({
  dayKey,
  puzzle,
}: {
  dayKey: string | null;
  puzzle: ReturnType<typeof selectDailyGame>;
}) {
  if (!dayKey || !puzzle) {
    return (
      <PaperCard variant="quiet" padding="lg" aria-live="polite" aria-busy>
        <p className="text-body text-ash">Preparing today&apos;s study…</p>
      </PaperCard>
    );
  }
  return (
    <a
      href="#todays-game"
      className="group block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArcadeGameCard
        image={ARCADE_ART.today}
        eyebrow="Today’s game"
        title={puzzle.title}
        description={puzzle.description}
        icon={puzzle.kind === "connections" ? "links" : "path"}
        footer={
          <>
            <span className="inline-flex items-center gap-1.5">
              <IconClock size={14} /> About {puzzle.estimatedMinutes} minutes
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-white">
              Open <IconArrowRight size={14} />
            </span>
          </>
        }
      />
    </a>
  );
}

/** Optional Plus breadth, shown as a shelf item rather than a footnote. */
function ArchiveCard({
  loading,
  isPlus,
  onExplorePlus,
}: {
  loading: boolean;
  isPlus: boolean;
  onExplorePlus: () => void;
}) {
  const card = (
    <ArcadeGameCard
      image={ARCADE_ART.archive}
      eyebrow={isPlus ? "Your archive" : "Archive · Plus"}
      title="Every study, kept"
      description="Revisit earlier studies by passage or theme. Plus adds breadth — never better answers, and never a paid explanation."
      icon="open-book"
      muted={!isPlus}
      footer={
        <>
          <span>Browse by theme</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-white">
            {isPlus ? "Open" : "Explore Plus"} <IconArrowRight size={14} />
          </span>
        </>
      }
    />
  );

  if (loading) {
    return (
      <PaperCard variant="quiet" padding="lg" aria-busy>
        <p className="text-body text-ash">Checking archive access…</p>
      </PaperCard>
    );
  }

  return isPlus ? (
    <Link
      href="/app/games/archive"
      className="group block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {card}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onExplorePlus}
      className="group block w-full rounded-[var(--radius-card)] text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {card}
    </button>
  );
}

function DailyGameEntry({
  puzzle,
  sessionKey,
}: {
  puzzle: NonNullable<ReturnType<typeof selectDailyGame>>;
  sessionKey: string;
}) {
  const hydrated = useHydrated();
  const [playing, setPlaying] = useState(false);
  const [savedStatus] = useState<GameStatus | "new">(() => {
    if (typeof window === "undefined") return "new";
    return readGameProgress(puzzle, sessionKey)?.status ?? "new";
  });
  const startEventRecorded = useRef(savedStatus !== "new");

  if (!hydrated) {
    return (
      <PaperCard variant="quiet" padding="lg" aria-busy>
        <p className="text-body text-ash">Checking this device…</p>
      </PaperCard>
    );
  }

  if (!playing) {
    return (
      <PaperCard variant="paper" padding="lg">
        <p className="text-caption font-medium uppercase tracking-[0.08em] text-ash">
          {savedStatus === "new"
            ? "Not started"
            : savedStatus === "playing"
              ? "Saved on this device"
              : "Study open"}
        </p>
        <h3 className="mt-2 font-display text-subheading text-graphite">
          {savedStatus === "playing"
            ? "Your place is waiting"
            : savedStatus === "completed" || savedStatus === "revealed"
              ? "Return to the learning card"
              : "Begin when you are ready"}
        </h3>
        <p className="mt-2 text-body text-charcoal">
          {puzzle.kind === "connections"
            ? "Tap four words that belong together. You can show every answer at any time."
            : "Tap what happened first, then what happened next. No moving cards."}
        </p>
        <GentleButton
          variant="primary"
          className="mt-5"
          onClick={() => {
            if (!startEventRecorded.current) {
              startEventRecorded.current = true;
              track("scripture_game_started", { kind: puzzle.kind });
            }
            setPlaying(true);
          }}
        >
          {savedStatus === "playing"
            ? "Resume game"
            : savedStatus === "completed" || savedStatus === "revealed"
              ? "Review learning"
              : "Start game"}
        </GentleButton>
      </PaperCard>
    );
  }

  return (
    <div id="daily-game-play">
      {puzzle.kind === "connections" ? (
        <ConnectionsGame puzzle={puzzle} sessionKey={sessionKey} />
      ) : (
        <TimelineGame puzzle={puzzle} sessionKey={sessionKey} />
      )}
    </div>
  );
}
