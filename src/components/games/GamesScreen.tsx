"use client";

import { useEffect, useRef, useState } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import {
  GentleButton,
  GentleLink,
} from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GREEN_FEATURES } from "@/lib/features/green";
import {
  dailyGameSessionKey,
  selectDailyGame,
} from "@/lib/games/selection";
import { readGameProgress } from "@/lib/games/storage";
import type { GameStatus } from "@/lib/games/types";
import { toDateKey } from "@/lib/utils/dates";
import { useHydrated } from "@/lib/utils/useHydrated";
import { track } from "@/lib/analytics/events";
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

/** Daily game hub: one complete free study, selected by local calendar day. */
export function GamesScreen() {
  const dayKey = useLocalDayKey();
  const puzzle = dayKey ? selectDailyGame(dayKey, GREEN_FEATURES) : null;

  return (
    <>
      <PageHeader
        title="Scripture Games"
        subtitle="Notice a pattern. Learn the passage. Carry it into life."
      />
      <PageContainer className="pb-8 pt-4">
        {!GREEN_FEATURES.games ? (
          <PaperCard variant="quiet" padding="lg">
            <h2 className="font-display text-subheading text-graphite">
              Scripture Games are resting
            </h2>
            <p className="mt-2 text-body text-charcoal">
              This feature is temporarily unavailable. The Bible, prayers, and
              quests remain ready.
            </p>
            <GentleLink href="/app/bible" variant="outline" className="mt-5">
              Open the Bible
            </GentleLink>
          </PaperCard>
        ) : !dayKey ? (
          <PaperCard
            variant="quiet"
            padding="lg"
            aria-live="polite"
            aria-busy="true"
          >
            <p className="text-body text-ash">Preparing today&apos;s study…</p>
          </PaperCard>
        ) : !puzzle ? (
          <PaperCard variant="quiet" padding="lg">
            <h2 className="font-display text-subheading text-graphite">
              Today&apos;s study is unavailable
            </h2>
            <p className="mt-2 text-body text-charcoal">
              The games are paused by a release setting. Nothing else in your
              journey is affected.
            </p>
          </PaperCard>
        ) : (
          <GameShell puzzle={puzzle}>
            <DailyGameEntry
              key={dailyGameSessionKey(dayKey, puzzle.id)}
              puzzle={puzzle}
              sessionKey={dailyGameSessionKey(dayKey, puzzle.id)}
            />
          </GameShell>
        )}
        {GREEN_FEATURES.games && (
          <PaperCard variant="outlined" padding="sm" className="mt-5">
            <p className="text-small text-ash">
              Today&apos;s game and every answer explanation are free. Optional
              Plus archives and themed collections add variety, never
              better answers or paid hints. Progress stays on this device.
            </p>
            <GentleLink
              href="/app/games/archive"
              variant="text"
              size="sm"
              className="mt-3"
            >
              Browse archive and themes
            </GentleLink>
          </PaperCard>
        )}
      </PageContainer>
    </>
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
            ? "Gather three groups of four. Answers and Scripture sources appear at the end."
            : "Arrange four moments in narrative order. Every moment opens back into its passage."}
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
