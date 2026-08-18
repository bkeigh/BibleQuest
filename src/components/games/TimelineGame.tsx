"use client";

import { useEffect, useRef, useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import {
  TIMELINE_REVEAL_AFTER,
  chooseTimelineItem,
  createTimelineProgress,
  revealTimeline,
} from "@/lib/games/engine";
import { scriptureSourceHref } from "@/lib/games/links";
import {
  readGameProgress,
  writeGameProgress,
} from "@/lib/games/storage";
import type { TimelineProgress, TimelinePuzzle } from "@/lib/games/types";
import { track } from "@/lib/analytics/events";
import { GameLearningCard } from "./GameLearningCard";

/** One-tap narrative sequence designed for young and first-time readers. */
export function TimelineGame({
  puzzle,
  sessionKey,
}: {
  puzzle: TimelinePuzzle;
  sessionKey: string;
}) {
  const [progress, setProgress] = useState<TimelineProgress>(() => {
    if (typeof window !== "undefined") {
      const restored = readGameProgress(puzzle, sessionKey);
      if (restored?.kind === "timeline") return restored;
    }
    return createTimelineProgress(puzzle, sessionKey);
  });
  const [announcement, setAnnouncement] = useState(
    "Tap the moment that happened first.",
  );
  const [resumeAvailable, setResumeAvailable] = useState(true);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultWasFocused = useRef(false);

  const finished = progress.status !== "playing";
  const availableItems = progress.itemOrder.flatMap((id) => {
    if (progress.selectedItemIds.includes(id)) return [];
    const item = puzzle.items.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  const chosenItems = puzzle.items.slice(0, progress.selectedItemIds.length);

  // Move focus to the result once so keyboard and screen-reader users do not
  // remain on a control that disappeared after completion or reveal.
  useEffect(() => {
    if (!finished || resultWasFocused.current) return;
    resultWasFocused.current = true;
    resultHeadingRef.current?.focus();
  }, [finished]);

  // Persist in the same user action so storage failure is visible immediately.
  function commitProgress(next: TimelineProgress) {
    setProgress(next);
    void writeGameProgress(next, puzzle).then(setResumeAvailable);
  }

  function choose(itemId: string) {
    const result = chooseTimelineItem(puzzle, progress, itemId);
    const opensLearning = result.progress.status !== "playing";
    if (opensLearning && !result.progress.learningEventRecorded) {
      track("scripture_game_completed", { kind: "timeline" });
    }
    commitProgress(
      opensLearning
        ? { ...result.progress, learningEventRecorded: true }
        : result.progress,
    );
    setAnnouncement(result.announcement);
  }

  function showOrder() {
    const revealed = revealTimeline(puzzle, progress);
    if (
      revealed.status === "revealed" &&
      !revealed.learningEventRecorded
    ) {
      track("scripture_game_completed", { kind: "timeline" });
      commitProgress({ ...revealed, learningEventRecorded: true });
    } else {
      commitProgress(revealed);
    }
    setAnnouncement(
      "The narrative order is shown below so you can explore each passage.",
    );
  }

  function playAgain() {
    resultWasFocused.current = false;
    commitProgress(createTimelineProgress(puzzle, sessionKey));
    setAnnouncement("Tap the moment that happened first.");
  }

  return (
    <>
      <PaperCard as="section" aria-label="Bible Timeline" padding="md">
        <div
          aria-live="polite"
          aria-atomic="true"
          className="rounded-[var(--radius-button)] bg-accent-surface px-4 py-3 text-small text-accent-ink"
        >
          {announcement}
        </div>
        {!resumeAvailable && (
          <p
            role="status"
            className="mt-3 rounded-[var(--radius-button)] border border-gold-500/35 bg-gold-500/10 px-3 py-2 text-caption leading-relaxed text-charcoal"
          >
            You can keep playing, but this browser cannot save your place.
            Leaving this page may restart the study.
          </p>
        )}
        {!finished && (
          <>
            <div className="mt-5 flex items-center justify-between gap-3">
              <h2 className="font-display text-[1.125rem] text-graphite">
                {progress.selectedItemIds.length === 0
                  ? "What happened first?"
                  : "What happened next?"}
              </h2>
              <p className="text-caption text-ash">
                Step {Math.min(progress.selectedItemIds.length + 1, 4)} of 4
              </p>
            </div>
            {chosenItems.length > 0 && (
              <ol
                className="mt-3 grid gap-2"
                aria-label="Moments already placed"
              >
                {chosenItems.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-[var(--radius-button)] bg-accent-surface px-3 py-2.5 text-small text-accent-ink"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper font-semibold text-accent">
                      {index + 1}
                    </span>
                    {item.label}
                  </li>
                ))}
              </ol>
            )}
            <div
              className="mt-3 grid gap-3"
              aria-label="Choose the next moment"
            >
              {availableItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => choose(item.id)}
                  className="min-h-16 rounded-[var(--radius-card)] border border-mist bg-linen px-4 py-3 text-left text-body font-medium text-graphite transition-colors hover:border-accent/45 hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <GentleButton
              variant="ghost"
              fullWidth
              className="mt-4"
              onClick={showOrder}
            >
              Show the whole story
            </GentleButton>
            {progress.misses > 0 && (
              <p className="mt-3 text-center text-caption text-ash">
                {progress.misses} of {TIMELINE_REVEAL_AFTER} gentle tries used.
              </p>
            )}
          </>
        )}
        {finished && (
          <>
            <h3
              ref={resultHeadingRef}
              tabIndex={-1}
              className="mt-5 text-center font-display text-[1.125rem] text-graphite focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              {progress.status === "completed"
                ? "You built the story!"
                : "Here is the whole story."}
            </h3>
            <ol className="mt-4 grid gap-3" aria-label="Story from first to last">
              {puzzle.items.map((item, index) => (
                <li key={item.id}>
                  <PaperCard variant="quiet" padding="sm" className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-small font-semibold text-accent">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-body font-medium text-graphite">
                        {item.label}
                      </p>
                      <p className="mt-1 text-small text-ash">
                        {item.explanation}
                      </p>
                      <a
                        href={scriptureSourceHref(item.source)}
                        className="mt-2 inline-block text-caption font-medium text-accent underline decoration-accent/35 underline-offset-4"
                      >
                        Open {item.source.reference}
                      </a>
                    </div>
                  </PaperCard>
                </li>
              ))}
            </ol>
            <GentleButton
              variant="outline"
              fullWidth
              className="mt-4"
              onClick={playAgain}
            >
              Play again
            </GentleButton>
          </>
        )}
      </PaperCard>
      {finished && <GameLearningCard puzzle={puzzle} />}
    </>
  );
}
