"use client";

/**
 * VerseDemo — the hero's live taste of the app's verse card.
 *
 * Server-renders today's verse (stable for SEO and the hourly ISR page),
 * then moves gently through a small reviewed set. Automatic changes stop
 * for reduced motion, hidden tabs, direct interaction, or a visitor's pause.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconBookmark, IconLeaf, IconSparkle } from "@/components/design-system/icons";
import { getVersePool } from "@/lib/questos/verse-engine";
import {
  buildHeroVerseRotation,
  HERO_VERSE_ROTATION_MS,
  nextHeroVerseIndex,
} from "@/lib/marketing/hero-verse-rotation";
import { cleanVerseText } from "@/lib/utils/scripture";
import { gentleEase } from "@/lib/motion";
import type { DailyVerse } from "@/lib/questos/types";

export function VerseDemo({ verse: initial }: { verse: DailyVerse }) {
  const reduceMotion = useReducedMotion();
  const verses = useMemo(
    () => buildHeroVerseRotation(initial, getVersePool()),
    [initial],
  );
  const [verseIndex, setVerseIndex] = useState(0);
  const [shuffled, setShuffled] = useState(false);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const verse = verses[verseIndex] ?? initial;

  // Rotate only while the card is idle and visible; hidden tabs spend no work.
  useEffect(() => {
    if (
      reduceMotion ||
      rotationPaused ||
      pointerPaused ||
      focusPaused ||
      verses.length < 2
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setVerseIndex((current) =>
        nextHeroVerseIndex(current, verses.length),
      );
      setShuffled(true);
    }, HERO_VERSE_ROTATION_MS);

    return () => window.clearInterval(interval);
  }, [
    focusPaused,
    pointerPaused,
    reduceMotion,
    rotationPaused,
    verses.length,
  ]);

  // Manual changes announce themselves; automatic changes stay quiet for assistive tech.
  function showNextVerse() {
    const nextIndex = nextHeroVerseIndex(verseIndex, verses.length);
    const next = verses[nextIndex] ?? initial;
    setVerseIndex(nextIndex);
    setShuffled(true);
    setAnnouncement(`Now showing ${next.reference}.`);
  }

  return (
    <PaperCard
      variant="atmospheric"
      padding="md"
      className="relative flex overflow-hidden lg:min-h-[27rem] lg:p-9"
      onPointerEnter={() => setPointerPaused(true)}
      onPointerLeave={() => setPointerPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusPaused(false);
        }
      }}
    >
      <div className="pointer-events-none absolute -right-3 -top-2 opacity-30">
        <IconLeaf className="text-olive-300" size={64} />
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="font-art-label text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent lg:text-[1.75rem]">
            {shuffled ? "From the Word" : "Today’s Verse"}
          </h2>
          <div className="flex items-center gap-1">
            <GentleButton
              variant="text"
              size="sm"
              onClick={showNextVerse}
              className="-my-2 min-h-11 shrink-0"
            >
              <IconSparkle size={15} />
              Another verse
            </GentleButton>
            {reduceMotion !== true && (
              <GentleButton
                variant="ghost"
                size="sm"
                onClick={() => setRotationPaused((paused) => !paused)}
                className="-my-2 min-h-11 min-w-11 px-2.5"
                aria-pressed={rotationPaused}
                aria-label={
                  rotationPaused
                    ? "Resume automatic verse rotation"
                    : "Pause automatic verse rotation"
                }
                title={rotationPaused ? "Play verses" : "Pause verses"}
              >
                <span aria-hidden="true" className="text-[0.875rem] leading-none">
                  {rotationPaused ? "▶" : "Ⅱ"}
                </span>
              </GentleButton>
            )}
          </div>
        </div>

        {/* Crossfades keep the card settled while preserving one readable verse. */}
        <div className="flex flex-1 items-center" aria-live="off">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={verse.id}
              className="w-full"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{
                duration: reduceMotion ? 0 : 0.45,
                ease: gentleEase,
              }}
            >
              <blockquote className="verse-text verse-text-lead verse-text-hero mt-4 text-left">
                “{cleanVerseText(verse.text)}”
              </blockquote>
              <cite className="mt-3 block text-left text-[0.9375rem] not-italic text-ash lg:text-[1rem]">
                — {verse.reference} <span className="text-fog">·</span>{" "}
                World English Bible
              </cite>
            </motion.div>
          </AnimatePresence>
        </div>
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </p>
        <div className="mt-4 flex items-center gap-2 text-[0.875rem] text-ash">
          <IconBookmark size={17} /> Save
        </div>
      </div>
    </PaperCard>
  );
}
