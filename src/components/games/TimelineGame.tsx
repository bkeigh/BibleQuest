"use client";

import { useEffect, useRef, useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import {
  TIMELINE_REVEAL_AFTER,
  createTimelineProgress,
  moveTimelineItem,
  revealTimeline,
  submitTimeline,
} from "@/lib/games/engine";
import { scriptureSourceHref } from "@/lib/games/links";
import {
  readGameProgress,
  writeGameProgress,
} from "@/lib/games/storage";
import type { TimelineProgress, TimelinePuzzle } from "@/lib/games/types";
import { useHydrated } from "@/lib/utils/useHydrated";
import { track } from "@/lib/analytics/events";
import { GameLearningCard } from "./GameLearningCard";

/** Accessible timeline surface uses explicit controls rather than dragging. */
export function TimelineGame({
  puzzle,
  sessionKey,
}: {
  puzzle: TimelinePuzzle;
  sessionKey: string;
}) {
  const hydrated = useHydrated();
  const [progress, setProgress] = useState<TimelineProgress>(() => {
    if (typeof window !== "undefined") {
      const restored = readGameProgress(puzzle, sessionKey);
      if (restored?.kind === "timeline") return restored;
    }
    return createTimelineProgress(puzzle, sessionKey);
  });
  const [announcement, setAnnouncement] = useState(
    "Use the move buttons to place the moments from first to last.",
  );
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultWasFocused = useRef(false);

  useEffect(() => {
    if (hydrated) writeGameProgress(progress, puzzle);
  }, [hydrated, progress, puzzle]);

  const finished = progress.status !== "playing";
  const orderedItems = progress.itemOrder.flatMap((id) => {
    const item = puzzle.items.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });

  // Move focus to the result once so keyboard and screen-reader users do not
  // remain on a control that disappeared after completion or reveal.
  useEffect(() => {
    if (!finished || resultWasFocused.current) return;
    resultWasFocused.current = true;
    resultHeadingRef.current?.focus();
  }, [finished]);

  function move(itemId: string, direction: "up" | "down") {
    setProgress((current) =>
      moveTimelineItem(current, itemId, direction),
    );
    const item = puzzle.items.find((candidate) => candidate.id === itemId);
    setAnnouncement(
      `${item?.label ?? "The moment"} moved ${direction === "up" ? "earlier" : "later"}.`,
    );
  }

  function checkOrder() {
    const result = submitTimeline(puzzle, progress);
    const opensLearning = result.progress.status !== "playing";
    if (opensLearning && !result.progress.learningEventRecorded) {
      track("scripture_game_completed", { kind: "timeline" });
    }
    setProgress(
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
      setProgress({ ...revealed, learningEventRecorded: true });
    } else {
      setProgress(revealed);
    }
    setAnnouncement(
      "The narrative order is shown below so you can explore each passage.",
    );
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
        <ol className="mt-5 grid gap-3" aria-label="Timeline from first to last">
          {orderedItems.map((item, index) => (
            <li key={item.id}>
              <PaperCard
                variant={finished ? "quiet" : "linen"}
                padding="sm"
                className="flex gap-3"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent-surface text-small font-semibold text-accent"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-graphite">
                    <span className="sr-only">Position {index + 1}: </span>
                    {item.label}
                  </p>
                  {finished && (
                    <>
                      <p className="mt-2 text-small text-ash">
                        {item.explanation}
                      </p>
                      <a
                        href={scriptureSourceHref(item.source)}
                        className="mt-2 inline-block text-caption font-medium text-accent underline decoration-accent/35 underline-offset-4"
                      >
                        {item.source.reference}
                      </a>
                    </>
                  )}
                  {!finished && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => move(item.id, "up")}
                        aria-label={`Move ${item.label} earlier`}
                        className="min-h-11 rounded-[var(--radius-button)] border border-mist bg-paper px-3 text-small font-medium text-charcoal disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        ↑ Move earlier
                      </button>
                      <button
                        type="button"
                        disabled={index === orderedItems.length - 1}
                        onClick={() => move(item.id, "down")}
                        aria-label={`Move ${item.label} later`}
                        className="min-h-11 rounded-[var(--radius-button)] border border-mist bg-paper px-3 text-small font-medium text-charcoal disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        ↓ Move later
                      </button>
                    </div>
                  )}
                </div>
              </PaperCard>
            </li>
          ))}
        </ol>
        {!finished && (
          <>
            <p className="mt-4 text-center text-small font-medium text-charcoal">
              Four moments · first to last
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <GentleButton variant="primary" fullWidth onClick={checkOrder}>
                Check the order
              </GentleButton>
              <GentleButton variant="ghost" fullWidth onClick={showOrder}>
                Show the narrative order
              </GentleButton>
            </div>
            <p className="mt-3 text-center text-caption text-ash">
              {progress.misses === 0
                ? "After three checks, the narrative order appears for study."
                : `${progress.misses} of ${TIMELINE_REVEAL_AFTER} orders checked.`}
            </p>
          </>
        )}
        {finished && (
          <h3
            ref={resultHeadingRef}
            tabIndex={-1}
            className="mt-5 text-center text-small font-medium text-charcoal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            {progress.status === "completed"
              ? "The moments are in narrative order."
              : "The order is open for study. There is no penalty for revealing it."}
          </h3>
        )}
      </PaperCard>
      {finished && <GameLearningCard puzzle={puzzle} />}
    </>
  );
}
