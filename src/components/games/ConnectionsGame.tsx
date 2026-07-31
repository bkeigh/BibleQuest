"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconCheck } from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import {
  CONNECTIONS_REVEAL_AFTER,
  createConnectionsProgress,
  revealConnections,
  submitConnections,
  toggleConnectionTerm,
} from "@/lib/games/engine";
import {
  readGameProgress,
  writeGameProgress,
} from "@/lib/games/storage";
import type {
  ConnectionsProgress,
  ConnectionsPuzzle,
  ScriptureSource,
} from "@/lib/games/types";
import { scriptureSourceHref } from "@/lib/games/links";
import { track } from "@/lib/analytics/events";
import { GameLearningCard } from "./GameLearningCard";

function SourceLinks({
  puzzleId,
  sources,
}: {
  puzzleId: string;
  sources: readonly ScriptureSource[];
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {sources.map((source) => (
        <li key={`${puzzleId}:${source.reference}`}>
          <a
            href={scriptureSourceHref(source)}
            className="text-caption font-medium text-accent underline decoration-accent/35 underline-offset-4"
          >
            {source.reference}
          </a>
        </li>
      ))}
    </ul>
  );
}

function GatheredGroup({
  puzzle,
  groupId,
}: {
  puzzle: ConnectionsPuzzle;
  groupId: string;
}) {
  const group = puzzle.groups.find((candidate) => candidate.id === groupId);
  if (!group) return null;
  return (
    <PaperCard variant="quiet" padding="sm" className="border-accent/35">
      <p className="text-small font-semibold text-accent">{group.title}</p>
      <p className="mt-1 text-small text-charcoal">{group.terms.join(" · ")}</p>
      <p className="mt-2 text-small text-ash">{group.explanation}</p>
      <SourceLinks puzzleId={puzzle.id} sources={group.sources} />
    </PaperCard>
  );
}

/** Accessible Connections play surface with local-only resume. */
export function ConnectionsGame({
  puzzle,
  sessionKey,
}: {
  puzzle: ConnectionsPuzzle;
  sessionKey: string;
}) {
  const [progress, setProgress] = useState<ConnectionsProgress>(() => {
    if (typeof window !== "undefined") {
      const restored = readGameProgress(puzzle, sessionKey);
      if (restored?.kind === "connections") return restored;
    }
    return createConnectionsProgress(puzzle, sessionKey);
  });
  const [announcement, setAnnouncement] = useState(
    "Choose four terms that share one clear connection.",
  );
  const [resumeAvailable, setResumeAvailable] = useState(true);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultWasFocused = useRef(false);

  const solvedTerms = useMemo(
    () =>
      new Set(
        puzzle.groups
          .filter((group) => progress.solvedGroupIds.includes(group.id))
          .flatMap((group) => group.terms),
      ),
    [progress.solvedGroupIds, puzzle.groups],
  );
  const availableTerms = useMemo(
    () =>
      new Set(progress.termOrder.filter((term) => !solvedTerms.has(term))),
    [progress.termOrder, solvedTerms],
  );
  const finished = progress.status !== "playing";
  const groupsToShow = finished
    ? puzzle.groups.map((group) => group.id)
    : progress.solvedGroupIds;

  // Move focus to the result once so keyboard and screen-reader users do not
  // remain on a control that disappeared after completion or reveal.
  useEffect(() => {
    if (!finished || resultWasFocused.current) return;
    resultWasFocused.current = true;
    resultHeadingRef.current?.focus();
  }, [finished]);

  // Persist in the same user action so storage failure is visible immediately.
  function commitProgress(next: ConnectionsProgress) {
    setResumeAvailable(writeGameProgress(next, puzzle));
    setProgress(next);
  }

  function toggle(term: string) {
    commitProgress(toggleConnectionTerm(progress, term, availableTerms));
  }

  function checkGroup() {
    const result = submitConnections(puzzle, progress);
    const opensLearning = result.progress.status !== "playing";
    if (opensLearning && !result.progress.learningEventRecorded) {
      track("scripture_game_completed", { kind: "connections" });
    }
    commitProgress(
      opensLearning
        ? { ...result.progress, learningEventRecorded: true }
        : result.progress,
    );
    setAnnouncement(result.announcement);
  }

  function showConnections() {
    const revealed = revealConnections(progress);
    if (
      revealed.status === "revealed" &&
      !revealed.learningEventRecorded
    ) {
      track("scripture_game_completed", { kind: "connections" });
      commitProgress({ ...revealed, learningEventRecorded: true });
    } else {
      commitProgress(revealed);
    }
    setAnnouncement(
      "The connections are shown below so you can explore the passages.",
    );
  }

  function clearChoices() {
    commitProgress({
      ...progress,
      selectedTerms: [],
      updatedAt: Date.now(),
    });
    setAnnouncement("Choices cleared. Pick four words that belong together.");
  }

  function playAgain() {
    resultWasFocused.current = false;
    commitProgress(createConnectionsProgress(puzzle, sessionKey));
    setAnnouncement("Pick four words that belong together.");
  }

  return (
    <>
      <PaperCard as="section" aria-label="Scripture Connections" padding="md">
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

        {groupsToShow.length > 0 && (
          <div className="mt-4 grid gap-3">
            {groupsToShow.map((groupId) => (
              <GatheredGroup
                key={groupId}
                puzzle={puzzle}
                groupId={groupId}
              />
            ))}
          </div>
        )}

        {!finished && (
          <>
            <p className="mt-4 text-small font-medium text-charcoal">
              Pick 4 words that belong together ·{" "}
              {progress.selectedTerms.length} picked
            </p>
            <div
              className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"
              aria-label="Connection terms"
            >
              {progress.termOrder
                .filter((term) => availableTerms.has(term))
                .map((term) => {
                  const selected = progress.selectedTerms.includes(term);
                  return (
                    <button
                      key={term}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggle(term)}
                      className={`min-h-16 rounded-[var(--radius-button)] border px-3 py-3 text-small font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        selected
                          ? "border-evergreen-700 bg-accent-surface text-accent-ink"
                          : "border-mist bg-linen text-charcoal hover:border-olive-300"
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        {selected && <IconCheck size={16} />}
                        {term}
                      </span>
                      {selected && (
                        <span className="mt-1 block text-caption text-accent">
                          Chosen
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <GentleButton
                variant="primary"
                fullWidth
                disabled={progress.selectedTerms.length !== 4}
                onClick={checkGroup}
              >
                Check these four
              </GentleButton>
              <GentleButton variant="ghost" fullWidth onClick={showConnections}>
                Show all answers
              </GentleButton>
            </div>
            {progress.selectedTerms.length > 0 && (
              <GentleButton
                variant="text"
                fullWidth
                className="mt-2"
                onClick={clearChoices}
              >
                Clear my picks
              </GentleButton>
            )}
            <p className="mt-3 text-center text-caption text-ash">
              {progress.misses === 0
                ? "After three tries, the answers open for study."
                : `${progress.misses} of ${CONNECTIONS_REVEAL_AFTER} unformed groups checked.`}
            </p>
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
                ? "You found every connection!"
                : "Here are all three connections."}
            </h3>
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
