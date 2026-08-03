"use client";

import { useState } from "react";
import Link from "next/link";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconArrowRight, IconCheck } from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import { scriptureSourceHref } from "@/lib/games/links";
import type { SevenDaysQuestion } from "@/lib/games/seven-days/types";
import { cn } from "@/lib/utils/cn";

/**
 * The gate between one level and the next.
 *
 * A wrong choice never closes the door — it opens the explanation and the
 * passage. The game is here to leave a reader knowing Genesis 1 a little
 * better, so withholding the answer would work against the only thing it is
 * for. What the choice does change is whether the level is marked as answered
 * first time, which is a memento, not a currency.
 */
export function SevenDaysQuestionCard({
  question,
  onContinue,
}: {
  question: SevenDaysQuestion;
  onContinue: (answeredFirstTry: boolean) => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const answered = chosen !== null;
  const correct = chosen === question.answerIndex;

  return (
    <PaperCard variant="paper" padding="lg" aria-live="polite">
      <p className="font-art-label text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
        One question
      </p>
      <h3 className="mt-3 font-display text-[1.375rem] leading-snug text-graphite">
        {question.prompt}
      </h3>

      <ul className="mt-5 space-y-2">
        {question.options.map((option, index) => {
          const isAnswer = index === question.answerIndex;
          const isChoice = chosen === index;
          return (
            <li key={option}>
              <button
                type="button"
                disabled={answered}
                aria-pressed={isChoice}
                onClick={() => setChosen(index)}
                className={cn(
                  "flex w-full min-h-12 items-center gap-3 rounded-[var(--radius-button)] border px-4 py-3 text-start text-body transition-colors duration-300 [transition-timing-function:var(--ease-gentle)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  !answered &&
                    "border-mist bg-linen/70 text-charcoal hover:border-accent/45",
                  answered && isAnswer && "border-accent bg-accent-surface text-accent-ink",
                  answered &&
                    !isAnswer &&
                    isChoice &&
                    "border-rose-300 bg-rose-50 text-rose-700",
                  answered && !isAnswer && !isChoice && "border-mist text-ash",
                )}
              >
                <span className="min-w-0 flex-1">{option}</span>
                {answered && isAnswer && (
                  <IconCheck size={18} className="shrink-0 text-accent" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <div className="mt-5 rounded-[var(--radius-card)] border border-mist bg-linen/70 p-4">
          <p className="text-small font-medium text-graphite">
            {correct ? "Yes — that is what the passage says." : "Not quite."}
          </p>
          <p className="mt-2 text-body leading-relaxed text-charcoal">
            {question.explanation}
          </p>
          <Link
            href={scriptureSourceHref(question.source)}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-small font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Read {question.source.reference} <IconArrowRight size={15} />
          </Link>
        </div>
      )}

      <GentleButton
        variant="primary"
        fullWidth
        className="mt-5"
        disabled={!answered}
        onClick={() => onContinue(correct)}
      >
        {answered ? "Continue" : "Choose an answer"}
      </GentleButton>
    </PaperCard>
  );
}
