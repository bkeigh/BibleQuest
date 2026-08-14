"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import {
  GentleButton,
  GentleLink,
} from "@/components/design-system/GentleButton";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
} from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { track } from "@/lib/analytics/events";
import { GREEN_FEATURES } from "@/lib/features/green";
import { scriptureSourceHref } from "@/lib/games/links";
import {
  SEVEN_DAYS_CHAPTERS,
  SEVEN_DAYS_LEVELS_PER_CHAPTER,
} from "@/lib/games/seven-days/content";
import {
  SEVEN_DAYS_LEVELS,
  levelOrdinal,
  levelsForChapter,
} from "@/lib/games/seven-days/levels";
import {
  isDayAnswered,
  isDayReadyForQuestions,
  isDaySkipped,
  isDayUnlocked,
  isLevelCleared,
  isLevelUnlocked,
  markDayAnswered,
  markDaySkipped,
  markLevelCleared,
  pendingQuestionDay,
  nextLevel,
  readSevenDaysProgress,
  sevenDaysStorageAvailable,
  summarize,
  writeSevenDaysProgress,
  type SevenDaysProgress,
} from "@/lib/games/seven-days/progress";
import { useArcadeAccess } from "@/lib/games/arcade/useArcadeAccess";
import { WebCommerceOnly } from "@/components/plus/WebCommerceOnly";
import { isNativeTarget } from "@/lib/platform/target";
import { SEVEN_DAYS_TILES } from "@/lib/games/seven-days/tiles";
import type {
  SevenDaysChapter,
  SevenDaysLevel,
} from "@/lib/games/seven-days/types";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils/cn";
import { SevenDaysLevelSession } from "./SevenDaysLevelSession";
import { SevenDaysQuestionRound } from "./SevenDaysQuestionRound";

type View =
  | { kind: "hub" }
  | { kind: "map" }
  | { kind: "level"; level: SevenDaysLevel }
  | { kind: "questions"; chapter: SevenDaysChapter };

function SevenDaysMatchInner() {
  const reduceMotion = useShouldReduceMotion();
  const arcade = useArcadeAccess();
  // ClientOnly holds this component back until after hydration, so the map can
  // be read straight from the device instead of flashing an empty one first.
  const [progress, setProgress] = useState<SevenDaysProgress>(
    readSevenDaysProgress,
  );
  // A device that cannot keep a record still plays; it just starts fresh.
  const [storageAvailable] = useState(sevenDaysStorageAvailable);
  const [view, setView] = useState<View>({ kind: "hub" });
  const [started, setStarted] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);

  const summary = useMemo(
    () => summarize(progress, arcade.gamePass),
    [arcade.gamePass, progress],
  );
  const resume = useMemo(() => nextLevel(progress), [progress]);

  const openLevel = useCallback(
    (level: SevenDaysLevel) => {
      if (!started) {
        setStarted(true);
        track("scripture_game_started", { kind: "seven-days-match" });
      }
      setView({ kind: "level", level });
    },
    [started],
  );

  const handleCleared = useCallback(
    (level: SevenDaysLevel) => {
      const updated = markLevelCleared(progress, level);
      setProgress(updated);
      void writeSevenDaysProgress(updated);
      // The last level of a day hands over to that day's questions; every
      // other level runs straight into the next board.
      const waiting = arcade.gamePass ? null : pendingQuestionDay(updated);
      if (waiting && waiting.id === level.chapterId) {
        setView({ kind: "questions", chapter: waiting });
        return;
      }
      if (arcade.gamePass && summarize(updated, true).complete) {
        track("scripture_game_completed", { kind: "seven-days-match" });
      }
      const following = SEVEN_DAYS_LEVELS[levelOrdinal(level) + 1];
      if (
        following &&
        isLevelUnlocked(updated, following, arcade.gamePass)
      ) {
        setView({ kind: "level", level: following });
      } else {
        setView({ kind: "map" });
      }
    },
    [arcade.gamePass, progress],
  );

  const handleRoundComplete = useCallback(
    (chapter: SevenDaysChapter, firstTryQuestionIds: string[]) => {
      const updated = markDayAnswered(progress, chapter, firstTryQuestionIds);
      setProgress(updated);
      void writeSevenDaysProgress(updated);
      // One completion for the whole week, not one per level: forty-nine
      // "completed" events would say almost nothing about whether the game
      // works, and would be the only place this app counted play that closely.
      if (summarize(updated, arcade.gamePass).complete) {
        track("scripture_game_completed", { kind: "seven-days-match" });
      }
      setView({ kind: "map" });
    },
    [arcade.gamePass, progress],
  );

  /** Uses one durable skip, or the permanent pass, without recording answers. */
  const bypassQuestions = useCallback(
    async (chapter: SevenDaysChapter) => {
      setPurchaseNotice(null);
      if (!arcade.gamePass) {
        const consumed = await arcade.consumeQuestionSkip(chapter.id);
        if (!consumed) {
          setPurchaseNotice(
            "A Question Skip couldn’t be used. Refresh the store and try again.",
          );
          return;
        }
      }
      const updated = arcade.gamePass
        ? progress
        : markDaySkipped(progress, chapter);
      if (updated !== progress) {
        setProgress(updated);
        void writeSevenDaysProgress(updated);
      }
      setPurchaseNotice(
        arcade.gamePass
          ? "Game Pass active — questions are optional."
          : "Question Skip used — the next chapter is open.",
      );
      setView({ kind: "map" });
    },
    [arcade, progress],
  );

  const transition = reduceMotion
    ? { duration: 0 }
    : ({ duration: 0.3, ease: [0.25, 0.4, 0.25, 1] } as const);

  if (!GREEN_FEATURES.sevenDaysMatch) {
    return (
      <PaperCard variant="quiet" padding="lg">
        <h2 className="font-display text-subheading text-graphite">
          Seven Days Match is resting
        </h2>
        <p className="mt-2 text-body text-charcoal">
          A release setting has paused this game. The Bible, prayers, and quests
          remain ready.
        </p>
        <GentleLink href="/app/games" variant="outline" className="mt-5">
          Back to the arcade
        </GentleLink>
      </PaperCard>
    );
  }

  return (
    /* One keyed surface per view, animated in and never out. An exit
       transition here would mean the screen can only change once the old one
       agrees to leave — and a game that will not leave a screen is broken in
       the way a reader notices most. */
    <motion.div
      key={
        view.kind === "level"
          ? view.level.id
          : view.kind === "questions"
            ? `questions-${view.chapter.id}`
            : view.kind
      }
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
      className="flex min-h-0 flex-1 flex-col"
    >
      {purchaseNotice && (
        <p
          role="status"
          className="mb-3 rounded-[var(--radius-button)] border border-accent/35 bg-accent-surface px-3 py-2 text-small text-accent-ink"
        >
          {purchaseNotice}
        </p>
      )}
      {view.kind === "hub" && (
        <div className="flex-1">
            <PaperCard variant="atmospheric" padding="lg" className="text-center">
              {/* One chip per day, in order — the week the game walks through,
                  and a quiet legend for the tiles the board is made of. */}
              <div
                aria-hidden="true"
                className="mx-auto flex w-fit items-end justify-center gap-1"
              >
                {SEVEN_DAYS_CHAPTERS.map((chapter) => (
                  <span
                    key={chapter.id}
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-[11px] ring-1",
                      SEVEN_DAYS_TILES[chapter.signature].chipClassName,
                    )}
                  >
                    <ArtIcon
                      name={SEVEN_DAYS_TILES[chapter.signature].sprite}
                      size={52}
                      // Oversized weighted sprites share the exact box centre.
                      className="absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 object-center"
                    />
                  </span>
                ))}
              </div>
              <p className="mt-5 font-art-label text-[0.875rem] uppercase tracking-[0.08em] text-gilt">
                Genesis 1:1 – 2:3
              </p>
              <h2 className="mt-2 font-display text-[2rem] leading-tight text-graphite">
                Seven Days Match
              </h2>
              <p className="mx-auto mt-2 max-w-md text-body leading-relaxed text-charcoal">
                Match three, answer one question from the passage, and open the
                next level across creation&apos;s seven-day story.
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Chip>
                  {summary.cleared}/{summary.total} levels
                </Chip>
                <Chip>{summary.daysOpened}/7 days</Chip>
                {summary.firstTry > 0 && (
                  <Chip>{summary.firstTry} answered first try</Chip>
                )}
              </div>

              <GentleButton
                variant="primary"
                size="lg"
                fullWidth
                className="mt-6"
                onClick={() => openLevel(resume)}
              >
                {summary.complete
                  ? `Play again · Day ${resume.day}, Level ${resume.level}`
                  : summary.cleared === 0
                    ? "Begin · Day 1, Level 1"
                    : `Continue · Day ${resume.day}, Level ${resume.level}`}
              </GentleButton>
              <GentleButton
                variant="outline"
                fullWidth
                className="mt-2"
                onClick={() => setView({ kind: "map" })}
              >
                The seven days
              </GentleButton>

              <p className="mt-5 text-caption leading-relaxed text-ash">
                All seven days and every answer are included. There are no
                lives and no timers, running out of moves costs nothing but
                another go
                {isNativeTarget()
                  ? "."
                  : ", and every question and explanation remain available when a store option makes the question gate optional."}
                {!storageAvailable &&
                  " This browser cannot save your place, so the map will start fresh next time."}
              </p>
              <WebCommerceOnly>
                <Link
                  href="/app/games/store"
                  className="mt-2 inline-flex min-h-11 items-center text-caption font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Question Skips and Game Pass
                </Link>
              </WebCommerceOnly>
            </PaperCard>
        </div>
      )}

      {view.kind === "map" && (
        <div className="flex-1">
            <button
              type="button"
              onClick={() => setView({ kind: "hub" })}
              className="inline-flex min-h-11 items-center gap-1.5 text-small font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconArrowLeft size={16} /> Seven Days Match
            </button>
            <ul className="mt-3 space-y-3">
              {SEVEN_DAYS_CHAPTERS.map((chapter) => {
                const levels = levelsForChapter(chapter.id);
                const clearedCount = levels.filter((level) =>
                  isLevelCleared(progress, level),
                ).length;
                const open = isDayUnlocked(
                  progress,
                  chapter,
                  arcade.gamePass,
                );
                const answered = isDayAnswered(progress, chapter);
                const skipped = isDaySkipped(progress, chapter);
                const questionsWaiting = isDayReadyForQuestions(
                  progress,
                  chapter,
                );
                const art = SEVEN_DAYS_TILES[chapter.signature];
                return (
                  <PaperCard
                    as="li"
                    key={chapter.id}
                    variant={open ? "paper" : "quiet"}
                    padding="md"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[12px] ring-1",
                          art.chipClassName,
                          !open && "opacity-45 grayscale",
                        )}
                      >
                        <ArtIcon
                          name={art.sprite}
                          size={56}
                          // Match the board's centred tile treatment on the map.
                          className="absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 object-center"
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-art-label text-caption uppercase tracking-[0.06em] text-gilt">
                          Day {chapter.day} · {clearedCount}/{levels.length}
                          {answered && " · answered"}
                          {skipped && " · skipped"}
                        </p>
                        <h3 className="mt-1 font-display text-subheading text-graphite">
                          {chapter.title}
                        </h3>
                        <p className="mt-1 text-small leading-relaxed text-ash">
                          {!open
                            ? "Answer the day before this one to open it."
                            : questionsWaiting
                              ? arcade.gamePass
                                ? "Every level is gathered. Questions are optional with your Game Pass."
                                : "Every level is gathered. Answer the questions or use a Question Skip to open the next day."
                              : chapter.summary}
                        </p>
                        {open && (
                          <Link
                            href={scriptureSourceHref(chapter.source)}
                            className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-caption font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            {chapter.source.reference}{" "}
                            <IconArrowRight size={14} />
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Seven across, always — the row is the day, and a set
                        that wrapped to five-and-two stopped reading as one. */}
                    {questionsWaiting && (
                      <div className="mt-3 grid gap-2">
                        <GentleButton
                          variant="primary"
                          fullWidth
                          onClick={() => setView({ kind: "questions", chapter })}
                        >
                          Answer Day {chapter.day}&apos;s questions
                        </GentleButton>
                        {(arcade.gamePass || arcade.questionSkips > 0) && (
                          <GentleButton
                            variant="outline"
                            fullWidth
                            onClick={() => void bypassQuestions(chapter)}
                          >
                            {arcade.gamePass
                              ? "Continue with Game Pass"
                              : `Use Question Skip (${arcade.questionSkips})`}
                          </GentleButton>
                        )}
                      </div>
                    )}

                    <ol className="mt-3 grid grid-cols-7 gap-1.5">
                      {levels.map((level) => {
                        const unlocked = isLevelUnlocked(
                          progress,
                          level,
                          arcade.gamePass,
                        );
                        const cleared = isLevelCleared(progress, level);
                        const firstTry = progress.firstTry.includes(level.id);
                        return (
                          <li key={level.id}>
                            <button
                              type="button"
                              disabled={!unlocked}
                              onClick={() => openLevel(level)}
                              aria-label={`Day ${level.day}, level ${level.level}${
                                cleared
                                  ? firstTry
                                    ? " — cleared, answered first try"
                                    : " — cleared"
                                  : unlocked
                                    ? ""
                                    : " — not open yet"
                              }`}
                              className={cn(
                                "flex aspect-square w-full min-h-11 items-center justify-center rounded-[11px] border text-small font-medium tabular-nums transition-colors duration-300",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                                cleared &&
                                  "border-accent/55 bg-accent-surface text-accent",
                                !cleared &&
                                  unlocked &&
                                  "border-mist bg-linen text-charcoal hover:border-accent/45",
                                !unlocked &&
                                  "border-mist/70 bg-transparent text-quill",
                              )}
                            >
                              {cleared ? (
                                <span className="relative">
                                  <IconCheck size={17} />
                                  {firstTry && (
                                    <span
                                      aria-hidden="true"
                                      className="absolute -end-1.5 -top-1.5 block h-1.5 w-1.5 rounded-full bg-gold-500"
                                    />
                                  )}
                                </span>
                              ) : (
                                level.level
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </PaperCard>
                );
              })}
            </ul>
        </div>
      )}

      {view.kind === "questions" && (
        <div className="flex-1">
          <SevenDaysQuestionRound
            key={view.chapter.id}
            chapter={view.chapter}
            onComplete={(marks) => handleRoundComplete(view.chapter, marks)}
            canBypass={arcade.gamePass || arcade.questionSkips > 0}
            bypassLabel={
              arcade.gamePass
                ? "Continue with Game Pass"
                : `Use Question Skip (${arcade.questionSkips})`
            }
            onBypass={() => bypassQuestions(view.chapter)}
            onExit={() => setView({ kind: "map" })}
          />
        </div>
      )}

      {view.kind === "level" && (
        <div className="flex min-h-0 flex-1 flex-col">
            <SevenDaysLevelSession
              // A new level is a new session: remounting resets the board,
              // the attempt count, and the phase without an effect to do it.
              key={view.level.id}
              level={view.level}
              nextLabel={
                view.level.level === SEVEN_DAYS_LEVELS_PER_CHAPTER
                  ? arcade.gamePass
                    ? view.level.day === SEVEN_DAYS_CHAPTERS.length
                      ? "The seven days"
                      : `Day ${view.level.day + 1}, Level 1`
                    : `Day ${view.level.day} questions`
                  : `Level ${view.level.level + 1}`
              }
              onExit={() => setView({ kind: "map" })}
              onCleared={() => handleCleared(view.level)}
            />
        </div>
      )}
    </motion.div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-mist bg-linen/70 px-3 py-1.5 text-caption text-charcoal">
      {children}
    </span>
  );
}

export function SevenDaysMatchScreen() {
  return (
    <ClientOnly>
      <SevenDaysMatchInner />
    </ClientOnly>
  );
}
