"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClock,
} from "@/components/design-system/icons";
import type { GuidedPractice } from "@/lib/guided/types";
import { movementsForPractice } from "@/lib/guided/types";
import {
  guidedProgressPercent,
  nextGuidedMovement,
} from "@/lib/guided/progress";
import { useQuestOS } from "@/lib/questos/store";
import type {
  GuidedMovementKey,
  GuidedSessionKind,
} from "@/lib/questos/types";
import { cn } from "@/lib/utils/cn";
import { GuidedProgressBar } from "./GuidedProgressBar";

interface GuidedPracticeRunnerProps {
  practice: GuidedPractice;
  sessionKey: string;
  kind: GuidedSessionKind;
  backHref: string;
  backLabel: string;
  contextLabel: string;
}

/** Six-movement reader that saves only navigation progress, never growth. */
export function GuidedPracticeRunner({
  practice,
  sessionKey,
  kind,
  backHref,
  backLabel,
  contextLabel,
}: GuidedPracticeRunnerProps) {
  const progress = useQuestOS((state) => state.guidedProgress[sessionKey]);
  const startGuidedSession = useQuestOS((state) => state.startGuidedSession);
  const completeGuidedMovement = useQuestOS(
    (state) => state.completeGuidedMovement,
  );
  const movements = useMemo(() => movementsForPractice(practice), [practice]);
  const initialMovement = nextGuidedMovement(progress);
  const [activeMovement, setActiveMovement] =
    useState<GuidedMovementKey>(initialMovement);
  const movementHeading = useRef<HTMLHeadingElement>(null);
  const completionHeading = useRef<HTMLHeadingElement>(null);

  const activeIndex = movements.findIndex(
    (movement) => movement.key === activeMovement,
  );
  const movement = movements[activeIndex] ?? movements[0];
  const completedCount = progress?.completedMovements.length ?? 0;
  const isComplete = Boolean(progress?.completedAt);

  // Focus the newly revealed movement without scrolling animation.
  useEffect(() => {
    if (!progress || isComplete) return;
    movementHeading.current?.focus();
  }, [activeMovement, isComplete, progress]);

  // Move keyboard and screen-reader focus to the newly revealed result.
  useEffect(() => {
    if (!isComplete) return;
    completionHeading.current?.focus();
  }, [isComplete]);

  function begin() {
    const started = startGuidedSession({
      sessionKey,
      contentId: practice.id,
      kind,
    });
    if (started) setActiveMovement(nextGuidedMovement(started));
  }

  function continuePractice() {
    const updated = completeGuidedMovement(sessionKey, movement.key);
    if (!updated?.completedAt) {
      setActiveMovement(nextGuidedMovement(updated ?? undefined));
    }
  }

  if (!progress) {
    return (
      <PageContainer className="pb-12 pt-safe">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-1.5 pt-4 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> {backLabel}
        </Link>
        <PaperCard variant="atmospheric" padding="lg" className="mt-5">
          <p className="font-pixel text-[0.8125rem] uppercase tracking-[0.1em] text-accent">
            {contextLabel}
          </p>
          <h1 className="mt-2 font-display text-[2rem] leading-tight text-graphite">
            {practice.title}
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-charcoal">
            {practice.summary}
          </p>
          <p className="mt-5 flex items-center gap-2 text-[0.8125rem] text-ash">
            <IconClock size={15} />
            About {practice.durationMinutes} minutes
          </p>
          <ol className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {movements.map((item, index) => (
              <li
                key={item.key}
                className="rounded-[var(--radius-button)] bg-paper/70 px-2 py-2 text-center text-[0.75rem] text-charcoal"
              >
                <span className="sr-only">Movement {index + 1}: </span>
                {item.label}
              </li>
            ))}
          </ol>
          <GentleButton
            type="button"
            variant="primary"
            fullWidth
            className="mt-6"
            onClick={begin}
          >
            Begin this practice
            <IconArrowRight />
          </GentleButton>
        </PaperCard>
        <p className="mt-5 text-center text-[0.75rem] leading-relaxed text-ash">
          You can leave at any time. Resume returns to the next unfinished
          movement.
        </p>
      </PageContainer>
    );
  }

  if (isComplete) {
    return (
      <PageContainer className="pb-12 pt-safe">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-1.5 pt-4 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> {backLabel}
        </Link>
        <PaperCard variant="atmospheric" padding="lg" className="mt-5 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-olive-500/15 text-accent">
            <IconCheck size={26} />
          </span>
          <p className="mt-4 font-pixel text-[0.8125rem] uppercase tracking-[0.1em] text-accent">
            Practice complete
          </p>
          <h1
            ref={completionHeading}
            tabIndex={-1}
            className="mt-2 font-display text-[1.875rem] text-graphite focus:outline-none"
          >
            {practice.title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-charcoal">
            The guide is saved. Return to its Scripture whenever you wish.
          </p>
          <div className="mt-6">
            <GuidedProgressBar value={100} label="All six movements complete" />
          </div>
          <GentleLink
            href={backHref}
            variant="primary"
            fullWidth
            className="mt-6"
          >
            Continue
            <IconArrowRight />
          </GentleLink>
          <GentleLink
            href={`/app/bible/${practice.scripture.bookSlug}/${practice.scripture.chapter}?verse=${practice.scripture.verseStart}-${practice.scripture.verseEnd}#verse-${practice.scripture.verseStart}`}
            variant="text"
            className="mt-4"
          >
            Read the passage again
          </GentleLink>
        </PaperCard>
        <PaperCard variant="quiet" padding="sm" className="mt-4">
          <p className="text-[0.75rem] leading-relaxed text-ash">
            Finishing a guide does not add growth by itself. Any Scripture,
            reflection, prayer, or quest you completed keeps its normal place in
            Journey—once.
          </p>
        </PaperCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="pb-12 pt-safe">
      <div className="flex items-center justify-between gap-4 pt-4">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> {backLabel}
        </Link>
        <span className="text-[0.75rem] text-ash">
          {completedCount + 1} of {movements.length}
        </span>
      </div>

      <div className="mt-3">
        <GuidedProgressBar
          value={guidedProgressPercent(progress)}
          label={`${practice.title} progress`}
        />
      </div>

      <ol aria-label="Guided Scripture movements" className="mt-5 flex gap-1.5">
        {movements.map((item, index) => {
          const done = progress.completedMovements.includes(item.key);
          const current = item.key === movement.key;
          const available = done || current || index <= completedCount;
          return (
            <li key={item.key} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!available}
                aria-current={current ? "step" : undefined}
                aria-label={`${item.label}${done ? ", complete" : current ? ", current" : ""}`}
                onClick={() => setActiveMovement(item.key)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border px-1 text-[0.6875rem] transition-colors motion-reduce:transition-none",
                  current
                    ? "border-accent bg-accent-surface font-medium text-accent"
                    : done
                      ? "border-olive-300/70 bg-olive-100/50 text-charcoal"
                      : "border-mist bg-paper/60 text-ash",
                )}
              >
                <span className="sr-only">{index + 1}. </span>
                {done ? <IconCheck size={15} /> : item.label}
              </button>
            </li>
          );
        })}
      </ol>

      <PaperCard as="article" variant="paper" padding="lg" className="mt-4">
        <p className="font-pixel text-[0.8125rem] uppercase tracking-[0.1em] text-accent">
          {movement.label}
        </p>
        <h1 className="mt-2 font-display text-[1.75rem] leading-tight text-graphite">
          {practice.title}
        </h1>
        <h2
          ref={movementHeading}
          tabIndex={-1}
          className="mt-5 font-display text-[1.25rem] text-graphite focus:outline-none"
        >
          {movement.title}
        </h2>

        {movement.key === "read" ? (
          <blockquote className="mt-4 border-l-2 border-gold-500/50 pl-4">
            <div className="space-y-3 font-serif text-[1.0625rem] leading-[1.8] text-charcoal">
              {practice.scripture.verses.map((verse, index) => (
                <p key={`${practice.id}-verse-${index}`}>
                  <sup className="mr-1 text-[0.6875rem] text-ash">
                    {practice.scripture.verseStart + index}
                  </sup>
                  {verse}
                </p>
              ))}
            </div>
            <footer className="mt-4 text-[0.75rem] text-ash">
              {practice.scripture.reference} ·{" "}
              {practice.scripture.translationLabel}
            </footer>
          </blockquote>
        ) : (
          <p className="mt-4 whitespace-pre-line text-[1rem] leading-[1.75] text-charcoal">
            {movement.body}
          </p>
        )}

        {movement.key === "read" && (
          <GentleLink
            href={`/app/bible/${practice.scripture.bookSlug}/${practice.scripture.chapter}?verse=${practice.scripture.verseStart}-${practice.scripture.verseEnd}#verse-${practice.scripture.verseStart}`}
            variant="text"
            className="mt-5"
          >
            Read the full chapter
            <IconArrowRight size={16} />
          </GentleLink>
        )}
        {movement.key === "reflect" && (
          <GentleLink
            href={`/app/prayer/reflection/new?guided=${encodeURIComponent(practice.id)}`}
            variant="outline"
            fullWidth
            className="mt-5"
          >
            Open Reflection Journal
          </GentleLink>
        )}
        {movement.key === "respond" && (
          <GentleLink
            href={`/app/quests/${practice.questSlug}`}
            variant="outline"
            fullWidth
            className="mt-5"
          >
            View the related quest
            <IconArrowRight size={16} />
          </GentleLink>
        )}
        {movement.key === "pray" && (
          <GentleLink
            href={`/app/prayer/new?guided=${encodeURIComponent(practice.id)}`}
            variant="outline"
            fullWidth
            className="mt-5"
          >
            Open Prayer Journal
          </GentleLink>
        )}

        <GentleButton
          type="button"
          variant="primary"
          fullWidth
          className="mt-6"
          onClick={continuePractice}
        >
          {movement.key === "pray" ? "Complete this practice" : "Continue"}
          <IconArrowRight />
        </GentleButton>
      </PaperCard>

      <p aria-live="polite" className="sr-only">
        {completedCount} of {movements.length} movements complete.
      </p>
    </PageContainer>
  );
}
