"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { GentleButton } from "@/components/design-system/GentleButton";
import {
  IconArrowRight,
  IconClose,
  IconRefresh,
} from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import { scriptureSourceHref } from "@/lib/games/links";
import { chapterById, verseForLevel } from "@/lib/games/seven-days/levels";
import {
  goalProgress,
  selectTile,
  shuffleSession,
  startLevel,
  trySwap,
  type SevenDaysSession,
} from "@/lib/games/seven-days/play";
import { SEVEN_DAYS_TILES } from "@/lib/games/seven-days/tiles";
import type { SevenDaysLevel } from "@/lib/games/seven-days/types";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils/cn";
import { SevenDaysBoard } from "./SevenDaysBoard";
import { SevenDaysGoalChip } from "./SevenDaysGoalChip";
import { SevenDaysScene, sceneById } from "./SevenDaysScene";
import { SevenDaysVerseStrip } from "./SevenDaysVerseStrip";

/**
 * Only two of these are chosen; the other two are what the board's own status
 * already says. Deriving them keeps one source of truth for "is this level
 * over" rather than a stage that has to be nudged into agreement.
 */
type Stage = "intro" | "play";
type Phase = Stage | "cleared" | "spent";

interface SevenDaysLevelSessionProps {
  level: SevenDaysLevel;
  /** What tapping through from the cleared card does next, named by the screen. */
  nextLabel: string;
  onExit: () => void;
  onCleared: () => void;
}

/**
 * One level, start to finish: the card that sets it up, the board, and the
 * question that closes it. Board state lives only here — leaving a level part
 * way through discards it rather than saving a half-played grid, which keeps
 * what the game stores to the one thing worth remembering.
 */
export function SevenDaysLevelSession({
  level,
  nextLabel,
  onExit,
  onCleared,
}: SevenDaysLevelSessionProps) {
  const reduceMotion = useShouldReduceMotion();
  const chapter = chapterById(level.chapterId);
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>("intro");
  const [session, setSession] = useState<SevenDaysSession>(() =>
    startLevel(level, 0),
  );
  const [announcement, setAnnouncement] = useState("");
  const [paused, setPaused] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const { state } = session;
  const goals = goalProgress(state);
  const verse = verseForLevel(level);
  const scene = sceneById(level.sceneId);
  const phase: Phase =
    state.status === "cleared"
      ? "cleared"
      : state.status === "out-of-moves"
        ? "spent"
        : stage;

  // Both endings replace the board with a card, so the reader — and anyone on
  // a screen reader — lands on the new heading rather than on a stale grid.
  useEffect(() => {
    if (phase === "cleared" || phase === "spent") headingRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (!paused) return;
    const resumeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setPaused(false);
    };
    window.addEventListener("keydown", resumeOnEscape);
    return () => window.removeEventListener("keydown", resumeOnEscape);
  }, [paused]);

  function restart() {
    const next = attempt + 1;
    setAttempt(next);
    setSession(startLevel(level, next));
    setAnnouncement("This level begins again.");
    setStage("play");
    setPaused(false);
  }

  function handleSwap(from: number, to: number) {
    const result = trySwap(session, from, to);
    setSession(result.session);
    if (result.announcement) setAnnouncement(result.announcement);
  }

  const transition = reduceMotion
    ? { duration: 0 }
    : ({ duration: 0.28, ease: [0.25, 0.4, 0.25, 1] } as const);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SevenDaysScene sceneId={level.sceneId} />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Enter-only, like the screen around it: a level that will not hand the
          board over because an exit transition never finished is a stuck game. */}
      <motion.div
        key={phase}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
        className="flex min-h-0 flex-1 flex-col"
      >
        {phase === "intro" && (
          <div className="flex-1">
            <PaperCard variant="atmospheric" padding="lg">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-pixel text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
                    Day {level.day} · Level {level.level}
                  </p>
                  <h2 className="mt-2 font-display text-[1.75rem] leading-tight text-graphite">
                    {chapter?.title}
                  </h2>
                  <p className="mt-2 max-w-md text-body leading-relaxed text-charcoal">
                    {chapter?.summary}
                  </p>
                </div>
                <div className="shrink-0 rounded-[var(--radius-card)] border border-mist bg-paper px-4 py-3 text-center">
                  <span className="block font-display text-[1.75rem] leading-none text-graphite tabular-nums">
                    {level.moves}
                  </span>
                  <span className="block text-caption text-ash">moves</span>
                </div>
              </div>

              <ul className="mt-5 space-y-2">
                {level.goals.map((goal) => (
                  <SevenDaysGoalChip
                    key={goal.tile}
                    tile={goal.tile}
                    have={0}
                    need={goal.count}
                    met={false}
                    variant="row"
                  />
                ))}
              </ul>

              {chapter && (
                <Link
                  href={scriptureSourceHref(chapter.source)}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-small font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Read {chapter.source.reference} <IconArrowRight size={15} />
                </Link>
              )}

              {scene && (
                <p className="mt-4 text-caption leading-relaxed text-ash">
                  Scene: {scene.title} — one of the living wallpapers in Plus.
                  It plays here for everyone.
                </p>
              )}

              <GentleButton
                variant="primary"
                fullWidth
                className="mt-5"
                onClick={() => setStage("play")}
              >
                Start level
              </GentleButton>
              <GentleButton
                variant="ghost"
                fullWidth
                className="mt-2"
                onClick={onExit}
              >
                Back to the seven days
              </GentleButton>
            </PaperCard>
          </div>
        )}

        {phase === "play" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaused(true)}
                aria-label="Pause"
                className="app-glass-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-button)] border border-mist bg-paper text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <PauseGlyph />
              </button>
              <div className="app-glass-surface flex min-w-0 flex-1 items-center justify-center gap-4 rounded-[var(--radius-button)] border border-mist bg-paper px-3 py-2">
                {goals.map((goal) => (
                  <SevenDaysGoalChip key={goal.tile} {...goal} />
                ))}
              </div>
              <div className="app-glass-surface shrink-0 rounded-[var(--radius-button)] border border-mist bg-paper px-3 py-1.5 text-center">
                <span
                  className={cn(
                    "block font-display text-[1.25rem] leading-none tabular-nums",
                    state.movesLeft <= 5 ? "text-rose-700" : "text-graphite",
                  )}
                >
                  {state.movesLeft}
                </span>
                <span className="block text-caption text-ash">moves</span>
              </div>
            </div>

            <div className="app-glass-surface flex items-center justify-between gap-3 rounded-[var(--radius-button)] border border-mist bg-paper px-3.5 py-2">
              <p className="min-w-0 truncate">
                <span className="font-pixel text-caption uppercase tracking-[0.06em] text-gilt">
                  Day {level.day} · Level {level.level}
                </span>
                <span className="ms-2 font-display text-small text-graphite">
                  {chapter?.title}
                </span>
              </p>
              <p className="shrink-0 text-end">
                <span className="block text-caption uppercase tracking-[0.08em] text-ash">
                  Score
                </span>
                <span className="block font-display text-small text-graphite tabular-nums">
                  {state.points}
                </span>
              </p>
            </div>

            <SevenDaysBoard
              board={state.board}
              selected={state.selected}
              disabled={state.status !== "playing"}
              onSelect={(index) => setSession(selectTile(session, index))}
              onSwap={handleSwap}
            />

            <div className="flex items-center gap-2">
              <GentleButton
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setSession(shuffleSession(session));
                  setAnnouncement("The board was rearranged. No move was spent.");
                }}
              >
                <IconRefresh size={16} /> Shuffle
              </GentleButton>
              {chapter && (
                <Link
                  href={scriptureSourceHref(chapter.source)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-button)] border border-accent/60 px-3.5 text-[0.9375rem] font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Read the passage
                </Link>
              )}
            </div>
            {verse && <SevenDaysVerseStrip verse={verse} />}

            <p className="text-center text-caption leading-relaxed text-ash">
              A swap that gathers nothing costs no move. Shuffling is always
              free.
            </p>
          </div>
        )}

        {phase === "cleared" && (
          <div className="flex-1">
            <PaperCard variant="atmospheric" padding="lg">
              <p className="font-pixel text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
                Level {level.level} gathered
              </p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-2 font-display text-[1.5rem] leading-tight text-graphite outline-none"
              >
                {chapter?.title}
              </h2>
              <p className="mt-2 text-body text-charcoal">
                {level.goals
                  .map(
                    (goal) => `${goal.count} ${SEVEN_DAYS_TILES[goal.tile].label}`,
                  )
                  .join(" · ")}{" "}
                · {state.points} points
              </p>
              <GentleButton
                variant="primary"
                fullWidth
                className="mt-5"
                onClick={onCleared}
              >
                {nextLabel}
              </GentleButton>
              <GentleButton
                variant="ghost"
                fullWidth
                className="mt-2"
                onClick={onExit}
              >
                Back to the seven days
              </GentleButton>
            </PaperCard>
          </div>
        )}

        {phase === "spent" && (
          <div className="flex-1">
            <PaperCard variant="paper" padding="lg">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-[1.5rem] text-graphite outline-none"
              >
                The moves are spent
              </h2>
              <p className="mt-2 text-body leading-relaxed text-charcoal">
                Nothing is lost and nothing is owed. Begin the level again
                whenever you like — there is no wait and no cost.
              </p>
              <ul className="mt-4 space-y-2">
                {goals.map((goal) => (
                  <SevenDaysGoalChip
                    key={goal.tile}
                    tile={goal.tile}
                    have={goal.have}
                    need={goal.need}
                    met={goal.met}
                    variant="row"
                  />
                ))}
              </ul>
              <GentleButton
                variant="primary"
                fullWidth
                className="mt-5"
                onClick={restart}
              >
                Try this level again
              </GentleButton>
              <GentleButton
                variant="ghost"
                fullWidth
                className="mt-2"
                onClick={onExit}
              >
                Back to the seven days
              </GentleButton>
            </PaperCard>
          </div>
        )}
      </motion.div>

      {paused && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
          <button
            type="button"
            aria-label="Resume"
            tabIndex={-1}
            onClick={() => setPaused(false)}
            className="absolute inset-0 cursor-default bg-graphite/35 backdrop-blur-[3px]"
          />
          <PaperCard
            as="section"
            role="dialog"
            aria-modal="true"
            aria-label="Paused"
            variant="paper"
            padding="lg"
            className="relative w-full max-w-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[1.375rem] text-graphite">
                Paused
              </h2>
              <button
                type="button"
                onClick={() => setPaused(false)}
                aria-label="Resume"
                className="flex h-11 w-11 items-center justify-center rounded-full text-ash hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <IconClose size={19} />
              </button>
            </div>
            <GentleButton
              variant="primary"
              fullWidth
              className="mt-4"
              onClick={() => setPaused(false)}
            >
              Resume
            </GentleButton>
            <GentleButton
              variant="outline"
              fullWidth
              className="mt-2"
              onClick={restart}
            >
              Restart level
            </GentleButton>
            <GentleButton
              variant="ghost"
              fullWidth
              className="mt-2"
              onClick={onExit}
            >
              Back to the seven days
            </GentleButton>
            <p className="mt-4 text-caption leading-relaxed text-ash">
              Playing does not change your Journey, candle, or quest progress.
              Saving the verse under the board does, exactly as it would in the
              Bible.
            </p>
          </PaperCard>
        </div>
      )}
    </div>
  );
}

/** Two bars — the pause mark every game has taught, drawn to match our icons. */
function PauseGlyph() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9 6v12M15 6v12" />
    </svg>
  );
}
