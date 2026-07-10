"use client";

/**
 * VerseDemo — the hero's live taste of the app's verse card.
 *
 * Server-renders today's verse (stable for SEO and the hourly ISR page),
 * then lets visitors shuffle through the whole pool for fun. Random on
 * purpose — this is a demo of the product, not the daily rhythm itself
 * (the app's own "Another verse" stays deterministic per day).
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconBookmark, IconLeaf, IconSparkle } from "@/components/design-system/icons";
import { getVersePool } from "@/lib/questos/verse-engine";
import { cleanVerseText } from "@/lib/utils/scripture";
import { riseIn } from "@/lib/motion";
import type { DailyVerse } from "@/lib/questos/types";

export function VerseDemo({ verse: initial }: { verse: DailyVerse }) {
  const [verse, setVerse] = useState(initial);
  const [shuffled, setShuffled] = useState(false);

  function shuffle() {
    const pool = getVersePool();
    // Always land on a different verse than the one showing.
    let next = verse;
    while (next.id === verse.id) {
      next = pool[Math.floor(Math.random() * pool.length)];
    }
    setVerse(next);
    setShuffled(true);
  }

  return (
    <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-3 -top-2 opacity-30">
        <IconLeaf className="text-olive-300" size={64} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent">
          {shuffled ? "From the Word" : "Today’s Verse"}
        </h2>
        <GentleButton
          variant="text"
          size="sm"
          onClick={shuffle}
          className="-my-2 min-h-11 shrink-0"
        >
          <IconSparkle size={15} />
          Another verse
        </GentleButton>
      </div>
      {/* Stable aria-live wrapper: shuffles announce the new verse. */}
      <div aria-live="polite">
        <motion.div
          key={verse.id}
          variants={riseIn}
          initial={shuffled ? "hidden" : false}
          animate="visible"
        >
          <blockquote className="verse-text verse-text-lead mt-3 text-left">
            “{cleanVerseText(verse.text)}”
          </blockquote>
          <cite className="mt-4 block text-left text-[0.9375rem] not-italic text-ash">
            — {verse.reference}
          </cite>
        </motion.div>
      </div>
      <div className="mt-5 flex items-center gap-2 text-[0.875rem] text-ash">
        <IconBookmark size={17} /> Save
      </div>
    </PaperCard>
  );
}
