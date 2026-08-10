"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  EXTRA_MOVES,
  readInventory,
  spendBoost,
  writeInventory,
  type BoostId,
  type BoostInventory,
} from "@/lib/games/arcade/boosts";
import {
  addMoves,
  findHint,
  gatherKind,
  goalProgress,
  selectTile,
  shuffleSession,
  startLevel,
  trySwap,
  type SevenDaysSession,
} from "@/lib/games/seven-days/play";
import { SEVEN_DAYS_TILES } from "@/lib/games/seven-days/tiles";
import {
  readSevenDaysTutorialSeen,
  writeSevenDaysTutorialSeen,
} from "@/lib/games/seven-days/tutorial";
import type {
  SevenDaysBoard as SevenDaysBoardShape,
  SevenDaysLevel,
} from "@/lib/games/seven-days/types";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils/cn";
import { SevenDaysBoard } from "./SevenDaysBoard";
import { SevenDaysBoostBar } from "./SevenDaysBoostBar";
import { SevenDaysGoalChip } from "./SevenDaysGoalChip";
import { SevenDaysScene } from "./SevenDaysScene";
import { SevenDaysVerseStrip } from "./SevenDaysVerseStrip";

/**
 * Only two of these are chosen; the other two are what the board's own status
 * already says. Deriving them keeps one source of truth for "is this level
 * over" rather than a stage that has to be nudged into agreement.
 */
const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
  // New players see guidance once; returning players reach the existing intro.
  const [tutorialOpen, setTutorialOpen] = useState(
    () => !readSevenDaysTutorialSeen(),
  );
  // While a cascade plays, the board shown is a frame from the engine rather
  // than the committed state; input waits so a second tap cannot outrun it.
  const [preview, setPreview] = useState<{
    board: SevenDaysBoardShape;
    clearing: ReadonlySet<number> | null;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [combo, setCombo] = useState<number | null>(null);
  const [inventory, setInventory] = useState<BoostInventory>(readInventory);
  const [hinted, setHinted] = useState<{ from: number; to: number } | null>(
    null,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const tutorialHeadingRef = useRef<HTMLHeadingElement>(null);
  const startButtonId = "seven-days-start-level";

  const { state } = session;
  const goals = goalProgress(state);
  const verse = verseForLevel(level);
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

  /** Closes the tips, remembers completion, and restores a useful focus point. */
  const dismissTutorial = useCallback(() => {
    writeSevenDaysTutorialSeen();
    setTutorialOpen(false);
    setAnnouncement(
      stage === "play"
        ? "How to play closed. The board is ready."
        : "How to play closed. Start the level when you are ready.",
    );
    window.requestAnimationFrame(() => {
      if (stage === "play") pauseButtonRef.current?.focus();
      else document.getElementById(startButtonId)?.focus();
    });
  }, [stage]);

  // Replayed tips receive focus and can be dismissed with the standard key.
  useEffect(() => {
    if (!tutorialOpen || stage !== "play" || paused) return;
    tutorialHeadingRef.current?.focus();
    const dismissOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismissTutorial();
    };
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [dismissTutorial, paused, stage, tutorialOpen]);

  /** Starts play while leaving unread guidance beside the first live board. */
  function beginLevel() {
    setStage("play");
  }

  /** Leaves Pause and opens the same non-modal instructions above the board. */
  function replayTutorial() {
    setPaused(false);
    setTutorialOpen(true);
    setAnnouncement("How to play opened.");
  }

  function restart() {
    const next = attempt + 1;
    setAttempt(next);
    setSession(startLevel(level, next));
    setAnnouncement("This level begins again.");
    setStage("play");
    setPaused(false);
  }

  /**
   * Spends one board help.
   *
   * Never during a cascade, and never on a level that is already finished —
   * a help changes a game in progress, it does not rewrite a result. A hint
   * with nothing to point at is not spent at all, because the board being
   * stuck is what the free shuffle is for.
   */
  function spendOnBoard(id: BoostId) {
    if (playing || state.status !== "playing") return;
    const spent = spendBoost(inventory, id);
    if (!spent) return;

    if (id === "extra-moves") {
      setSession(addMoves(session, EXTRA_MOVES));
      setAnnouncement(`${EXTRA_MOVES} more moves.`);
    } else if (id === "hint") {
      const move = findHint(session);
      if (!move) {
        setAnnouncement("Nothing to trade here. Shuffling is free.");
        return;
      }
      setHinted(move);
      setAnnouncement("A trade worth making is marked on the board.");
      window.setTimeout(() => setHinted(null), 2600);
    } else {
      // Gather goes after whichever kind the level is still asking for, so the
      // help lands on the reader's goal rather than somewhere generic.
      const wanted =
        state.level.goals.find(
          (goal) => state.gathered[goal.tile] < goal.count,
        )?.tile ?? state.level.goals[0].tile;
      const result = gatherKind(session, wanted);
      if (result.gathered === 0) {
        setAnnouncement("None of those are on the board.");
        return;
      }
      setSession(result.session);
      setAnnouncement(
        `Gathered ${result.gathered} ${SEVEN_DAYS_TILES[wanted].label}.`,
      );
    }

    setInventory(spent);
    writeInventory(spent);
  }

  /**
   * Plays a move out instead of jumping to its result.
   *
   * The engine resolves a whole cascade in one call, which is right for the
   * rules and wrong for the eye: tiles would leave and arrive in the same
   * frame, and a four-deep cascade would look identical to a single match.
   * The frames it hands back are shown in order — the swap, then each wave's
   * holes, then each wave settled — and the real state commits at the end.
   *
   * Reduced motion skips straight to the result: the point of the animation is
   * to show what happened, and someone who has asked for stillness has said
   * they would rather be told.
   */
  async function handleSwap(from: number, to: number) {
    if (playing) return;
    const result = trySwap(session, from, to);

    if (result.rejected) {
      if (result.announcement) setAnnouncement(result.announcement);
      // Show the trade, then take it back, so a swap that gathers nothing
      // reads as "not that" rather than as a tap that did nothing.
      if (!reduceMotion && result.swapped) {
        setPlaying(true);
        setPreview({ board: result.swapped, clearing: null });
        await wait(200);
        setPreview(null);
        setPlaying(false);
      }
      setSession(result.session);
      return;
    }

    if (reduceMotion || result.steps.length === 0) {
      if (result.announcement) setAnnouncement(result.announcement);
      setSession(result.session);
      return;
    }

    setPlaying(true);
    setPreview({ board: result.swapped ?? state.board, clearing: null });
    await wait(120);
    for (const step of result.steps) {
      setPreview({ board: step.emptied, clearing: step.matched });
      if (step.cascade > 1) setCombo(step.cascade);
      await wait(170);
      setPreview({ board: step.settled, clearing: null });
      await wait(150);
    }
    setCombo(null);
    if (result.reshuffledBoard) {
      setPreview({ board: result.reshuffledBoard, clearing: null });
      await wait(200);
    }
    setPreview(null);
    setPlaying(false);
    setSession(result.session);
    // Announced after the cascade, so a screen reader is told what happened
    // rather than what is about to.
    if (result.announcement) setAnnouncement(result.announcement);
  }

  const transition = reduceMotion
    ? { duration: 0 }
    : ({ duration: 0.28, ease: [0.25, 0.4, 0.25, 1] } as const);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SevenDaysScene />
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
                  <p className="font-art-label text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
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

              {tutorialOpen && (
                <SevenDaysTutorial
                  headingRef={tutorialHeadingRef}
                  onDismiss={dismissTutorial}
                />
              )}

              {chapter && (
                <Link
                  href={scriptureSourceHref(chapter.source)}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-small font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Read {chapter.source.reference} <IconArrowRight size={15} />
                </Link>
              )}

              <GentleButton
                id={startButtonId}
                variant="primary"
                fullWidth
                className="mt-5"
                onClick={beginLevel}
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
                ref={pauseButtonRef}
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
                <motion.span
                  key={state.movesLeft}
                  initial={{ scale: reduceMotion ? 1 : 1.25 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.22 }}
                  className={cn(
                    "block font-display text-[1.25rem] leading-none tabular-nums",
                    state.movesLeft <= 5 ? "text-rose-700" : "text-graphite",
                  )}
                >
                  {state.movesLeft}
                </motion.span>
                <span className="block text-caption text-ash">moves</span>
              </div>
            </div>

            <div className="app-glass-surface flex items-center justify-between gap-3 rounded-[var(--radius-button)] border border-mist bg-paper px-3.5 py-2">
              <p className="min-w-0 truncate">
                <span className="font-art-label text-caption uppercase tracking-[0.06em] text-gilt">
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

            {tutorialOpen && (
              <SevenDaysTutorial
                headingRef={tutorialHeadingRef}
                onDismiss={dismissTutorial}
              />
            )}

            <div className="relative">
              {combo !== null && !reduceMotion && (
                <motion.p
                  key={combo}
                  aria-hidden="true"
                  initial={{ opacity: 0, y: 8, scale: 0.92 }}
                  animate={{ opacity: 1, y: -4, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 text-center font-display text-[2rem] text-gilt drop-shadow-[0_2px_0_rgba(255,255,255,0.8)]"
                >
                  {combo === 2
                    ? "And more fell"
                    : combo === 3
                      ? "And more still"
                      : "It keeps going"}
                </motion.p>
              )}
              <SevenDaysBoard
              board={preview?.board ?? state.board}
              selected={preview ? null : state.selected}
              disabled={playing || state.status !== "playing"}
              clearing={preview?.clearing ?? undefined}
              onSelect={(index) => setSession(selectTile(session, index))}
              onSwap={(from, to) => void handleSwap(from, to)}
              hinted={hinted}
              />
            </div>

            <SevenDaysBoostBar
              inventory={inventory}
              disabled={playing || state.status !== "playing"}
              onUse={spendOnBoard}
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
              <p className="font-art-label text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
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
              onClick={replayTutorial}
            >
              How to play
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

interface SevenDaysTutorialProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onDismiss: () => void;
}

/** Teaches the complete first move without covering or disabling the board. */
function SevenDaysTutorial({
  headingRef,
  onDismiss,
}: SevenDaysTutorialProps) {
  return (
    <section
      aria-labelledby="seven-days-how-to-play"
      className="mt-4 rounded-[var(--radius-card)] border border-gold-500/45 bg-gold-500/10 p-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-art-label text-caption uppercase tracking-[0.06em] text-gilt">
            Three simple steps
          </p>
          <h3
            id="seven-days-how-to-play"
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 font-display text-[1.25rem] text-graphite outline-none"
          >
            How to play
          </h3>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide how to play"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ash hover:bg-paper/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IconClose size={18} />
        </button>
      </div>
      <ol className="mt-2.5 grid gap-2 text-small leading-relaxed text-charcoal sm:grid-cols-3">
        <li>
          <strong className="font-semibold text-graphite">
            1. Swap adjacent tiles.
          </strong>{" "}
          Swipe one tile toward its neighbor, or select two neighboring tiles.
          With a keyboard, use the arrow keys and Enter or Space.
        </li>
        <li>
          <strong className="font-semibold text-graphite">
            2. Match 3 or more.
          </strong>{" "}
          Line up at least three matching tiles. A swap that makes no match
          returns for free.
        </li>
        <li>
          <strong className="font-semibold text-graphite">
            3. Collect the pictured goal.
          </strong>{" "}
          Gather the tiles shown above the board before your moves reach zero.
        </li>
      </ol>
      <GentleButton
        variant="outline"
        size="sm"
        fullWidth
        className="mt-3 bg-paper/45"
        onClick={onDismiss}
      >
        Got it
      </GentleButton>
    </section>
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
