"use client";

import { useRef, useState } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { IconArrowLeft } from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import { usePlus } from "@/lib/billing/usePlus";
import { GREEN_FEATURES } from "@/lib/features/green";
import { getGameAccess } from "@/lib/games/access";
import { readGameProgress } from "@/lib/games/storage";
import type { GamePuzzle, GameStatus } from "@/lib/games/types";
import { useHydrated } from "@/lib/utils/useHydrated";
import { track } from "@/lib/analytics/events";
import { ConnectionsGame } from "./ConnectionsGame";
import { GameShell } from "./GameShell";
import { TimelineGame } from "./TimelineGame";

/** Member archive player keeps the free daily route one tap away. */
export function ArchiveGameScreen({ puzzle }: { puzzle: GamePuzzle }) {
  const plus = usePlus();
  const hydrated = useHydrated();
  const access = getGameAccess("archive", plus.isPlus);
  const sessionKey = `archive:${puzzle.id}:v${puzzle.contentVersion}`;
  const enabled =
    GREEN_FEATURES.games &&
    (puzzle.kind === "connections"
      ? GREEN_FEATURES.scriptureConnections
      : GREEN_FEATURES.bibleTimeline);
  const [playing, setPlaying] = useState(false);
  const [savedStatus] = useState<GameStatus | "new">(() => {
    if (typeof window === "undefined") return "new";
    return readGameProgress(puzzle, sessionKey)?.status ?? "new";
  });
  const startEventRecorded = useRef(savedStatus !== "new");

  return (
    <>
      <PageHeader
        title="Archive Study"
        subtitle="Revisit without a timer, ranking, or Journey credit."
      />
      <PageContainer className="pb-8 pt-4">
        <GentleLink href="/app/games/archive" variant="text" size="sm">
          <IconArrowLeft size={17} />
          Game archive
        </GentleLink>
        {!hydrated || plus.loading ? (
          <PaperCard variant="quiet" padding="lg" className="mt-4" aria-busy>
            <p className="text-body text-ash">Checking archive access…</p>
          </PaperCard>
        ) : !access.allowed ? (
          <PaperCard variant="atmospheric" padding="lg" className="mt-4">
            <h2 className="font-display text-subheading text-graphite">
              Today&apos;s study is still available
            </h2>
            <p className="mt-2 text-body text-charcoal">{access.message}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <GentleLink href="/app/games" variant="primary">
                Play today&apos;s game
              </GentleLink>
              <GentleLink href="/app/plus" variant="outline">
                Explore Plus
              </GentleLink>
            </div>
          </PaperCard>
        ) : !enabled ? (
          <PaperCard variant="quiet" padding="lg" className="mt-4">
            <h2 className="font-display text-subheading text-graphite">
              This format is resting
            </h2>
            <p className="mt-2 text-body text-charcoal">
              A release setting has paused this game format. Other BibleQuest
              features are unaffected.
            </p>
          </PaperCard>
        ) : (
          <div className="mt-4">
            <GameShell puzzle={puzzle} context="archive">
              {!playing ? (
                <PaperCard variant="paper" padding="lg">
                  <p className="text-caption font-medium uppercase tracking-[0.08em] text-ash">
                    {savedStatus === "playing"
                      ? "Saved on this device"
                      : savedStatus === "new"
                        ? "Archive study"
                        : "Learning card ready"}
                  </p>
                  <h3 className="mt-2 font-display text-subheading text-graphite">
                    {savedStatus === "playing"
                      ? "Resume where you paused"
                      : "Return to this passage"}
                  </h3>
                  <GentleButton
                    variant="primary"
                    className="mt-5"
                    onClick={() => {
                      if (!startEventRecorded.current) {
                        startEventRecorded.current = true;
                        track("scripture_game_started", {
                          kind: puzzle.kind,
                        });
                      }
                      setPlaying(true);
                    }}
                  >
                    {savedStatus === "playing"
                      ? "Resume game"
                      : savedStatus === "new"
                        ? "Start game"
                        : "Review learning"}
                  </GentleButton>
                </PaperCard>
              ) : puzzle.kind === "connections" ? (
                <ConnectionsGame
                  puzzle={puzzle}
                  sessionKey={sessionKey}
                />
              ) : (
                <TimelineGame puzzle={puzzle} sessionKey={sessionKey} />
              )}
            </GameShell>
          </div>
        )}
      </PageContainer>
    </>
  );
}
