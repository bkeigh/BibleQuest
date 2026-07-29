"use client";

import { useState } from "react";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import {
  IconArrowRight,
  IconBible,
  IconShare,
} from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import { gameShareText, scriptureSourceHref } from "@/lib/games/links";
import type { GamePuzzle } from "@/lib/games/types";
import { buildPublicUrl } from "@/lib/platform/api";
import { shareContent } from "@/lib/platform/share";

/** Sourced learning is the game reward and always remains free. */
export function GameLearningCard({ puzzle }: { puzzle: GamePuzzle }) {
  const [shareStatus, setShareStatus] = useState("");

  async function shareResult() {
    const text = gameShareText(puzzle);
    const outcome = await shareContent({
      title: "BibleQuest",
      text,
      url: buildPublicUrl("/app/games"),
    });
    setShareStatus(
      outcome === "shared"
        ? "Share opened."
        : outcome === "copied"
          ? "A spoiler-free result link was copied."
          : outcome === "cancelled"
            ? ""
            : "Sharing is not available right now.",
    );
  }

  return (
    <PaperCard
      as="section"
      variant="atmospheric"
      padding="lg"
      aria-labelledby="game-learning-title"
      className="mt-5 border-gold-500/35"
    >
      <p className="font-pixel text-[0.9375rem] uppercase tracking-[0.06em] text-gilt">
        Carry this with you
      </p>
      <h3
        id="game-learning-title"
        className="mt-3 font-display text-[1.5rem] leading-tight text-graphite"
      >
        {puzzle.learning.title}
      </h3>
      <p className="mt-3 text-body text-charcoal">{puzzle.learning.summary}</p>
      <div className="mt-4">
        <p className="text-caption font-medium uppercase tracking-[0.08em] text-ash">
          Scripture sources
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {puzzle.learning.sources.map((source) => (
            <li key={`${puzzle.id}:${source.reference}`}>
              <a
                href={scriptureSourceHref(source)}
                className="text-small font-medium text-accent underline decoration-accent/35 underline-offset-4 hover:decoration-accent"
              >
                {source.reference}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <GentleLink
          href={scriptureSourceHref(puzzle.learning.readSource)}
          variant="primary"
          fullWidth
        >
          <IconBible size={18} />
          Read the passage
        </GentleLink>
        {puzzle.learning.relatedQuestSlug && (
          <GentleLink
            href={`/app/quests/${puzzle.learning.relatedQuestSlug}`}
            variant="outline"
            fullWidth
          >
            {puzzle.learning.relatedQuestLabel}
            <IconArrowRight size={18} />
          </GentleLink>
        )}
      </div>
      <div className="mt-4 border-t border-mist pt-4">
        <GentleButton variant="ghost" size="sm" onClick={shareResult}>
          <IconShare size={18} />
          Share a spoiler-free result
        </GentleButton>
        <p className="mt-2 text-caption text-ash">
          Sharing includes the study theme only—never answers, attempts, or
          private spiritual activity.
        </p>
        <p aria-live="polite" className="mt-1 min-h-5 text-caption text-accent">
          {shareStatus}
        </p>
      </div>
    </PaperCard>
  );
}
