"use client";

import { useRef, useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconCheck } from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import {
  BOOSTS,
  boostsEarnedForRound,
  grantBoost,
  readInventory,
  writeInventory,
} from "@/lib/games/arcade/boosts";
import type { SevenDaysChapter } from "@/lib/games/seven-days/types";
import { cn } from "@/lib/utils/cn";
import { SevenDaysQuestionCard } from "./SevenDaysQuestionCard";

/**
 * The seven questions that close a day and open the next.
 *
 * Moved here from the end of every level: a question between each board turned
 * a day into seven interruptions, and the questions themselves read as a toll
 * rather than as the point. Gathered into one round at the end of the day, they
 * become the thing the day was for.
 *
 * The round opens the next day however it goes. Every answer shows its
 * explanation and its passage, so a wrong one is where the reading happens —
 * blocking there would stop exactly the reader who most needs the next screen.
 */
export function SevenDaysQuestionRound({
  chapter,
  onComplete,
  onExit,
}: {
  chapter: SevenDaysChapter;
  onComplete: (firstTryQuestionIds: string[]) => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [firstTry, setFirstTry] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const question = chapter.questions[index];
  const total = chapter.questions.length;

  if (done) {
    const perfect = firstTry.length === total;
    const earned = boostsEarnedForRound(firstTry.length, total);
    return (
      <PaperCard variant="atmospheric" padding="lg">
        <p className="font-art-label text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
          Day {chapter.day} · complete
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 font-display text-[1.75rem] leading-tight text-graphite outline-none"
        >
          {chapter.title}
        </h2>
        <p className="mt-2 text-body leading-relaxed text-charcoal">
          {perfect
            ? `All ${total} answered first time. The next day is open.`
            : `${firstTry.length} of ${total} answered first time — and every explanation is yours to read again. The next day is open.`}
        </p>
        {earned.length > 0 && (
          <div className="mt-4 rounded-[var(--radius-button)] border border-gold-500/35 bg-gold-500/10 p-3">
            <p className="text-small font-medium text-gilt">
              Earned for the board
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {earned.map((grant) => (
                <li key={grant.id} className="text-caption text-charcoal">
                  {grant.count} × {BOOSTS[grant.id].name}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-caption leading-relaxed text-ash">
              Helps are for the board only. Nothing here buys an answer.
            </p>
          </div>
        )}

        <GentleButton
          variant="primary"
          fullWidth
          className="mt-5"
          onClick={() => {
            // Reading is what earns them, so the grant lands with the round.
            if (earned.length > 0) {
              let inventory = readInventory();
              for (const grant of earned) {
                inventory = grantBoost(inventory, grant.id, grant.count);
              }
              writeInventory(inventory);
            }
            onComplete(firstTry);
          }}
        >
          Continue
        </GentleButton>
      </PaperCard>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-art-label text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
          Day {chapter.day} questions
        </p>
        <p className="text-caption text-ash tabular-nums">
          {index + 1} of {total}
        </p>
      </div>

      {/* One pip per question, filled as the round goes — a reader can see how
          much is left without a progress bar competing with the card. */}
      <ol aria-hidden="true" className="mt-2 flex gap-1.5">
        {chapter.questions.map((entry, position) => (
          <li
            key={entry.id}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              position < index
                ? firstTry.includes(chapter.questions[position].id)
                  ? "bg-accent"
                  : "bg-gold-500"
                : position === index
                  ? "bg-accent/40"
                  : "bg-mist",
            )}
          />
        ))}
      </ol>

      <div className="mt-4">
        <SevenDaysQuestionCard
          key={question.id}
          question={question}
          onContinue={(answeredFirstTry) => {
            const marks = answeredFirstTry
              ? [...firstTry, question.id]
              : firstTry;
            setFirstTry(marks);
            if (index + 1 < total) setIndex(index + 1);
            else setDone(true);
          }}
        />
      </div>

      <button
        type="button"
        onClick={onExit}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 px-1 text-small text-ash transition-colors hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Finish these later
      </button>

      <p className="mt-1 flex items-center gap-1.5 px-1 text-caption text-ash">
        <IconCheck size={14} className="shrink-0 text-accent" />
        Every answer opens its explanation and its passage, right or wrong.
      </p>
    </div>
  );
}
