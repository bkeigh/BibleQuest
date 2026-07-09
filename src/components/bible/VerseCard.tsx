"use client";

import { motion } from "framer-motion";
import type { DailyVerse } from "@/lib/questos/types";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconLeaf,
  IconSparkle,
} from "@/components/design-system/icons";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { cleanVerseText } from "@/lib/utils/scripture";
import { useStrings } from "@/lib/i18n";
import { riseIn } from "@/lib/motion";

/**
 * VerseCard — today's verse as a devotional card / margin note.
 */
export function VerseCard({
  verse,
  onAnotherVerse,
}: {
  verse: DailyVerse;
  /**
   * Optional "Another verse" control in the kicker row. Home passes the
   * store's refreshVerse so the swap holds steady for the day — a quiet
   * offer of a different word, never a slot machine.
   */
  onAnotherVerse?: () => void;
}) {
  const { toast } = useToast();
  const t = useStrings();
  const bookmarks = useQuestOS((s) => s.bookmarks);
  const toggleBookmark = useQuestOS((s) => s.toggleBookmark);

  const bookName =
    verse.bookSlug === "psalms"
      ? "Psalms"
      : verse.reference.replace(/\s+\d+:.*$/, "");

  const saved = bookmarks.some(
    (b) =>
      b.bookSlug === verse.bookSlug &&
      b.chapter === verse.chapter &&
      b.verse === verse.verseStart
  );

  return (
    <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-3 -top-2 opacity-30">
        <IconLeaf className="text-olive-300" size={64} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-pixel text-[1.25rem] leading-tight uppercase tracking-[0.05em] text-accent">
          {t.home.todaysVerse}
        </h2>
        {onAnotherVerse && (
          <GentleButton
            variant="text"
            size="sm"
            onClick={onAnotherVerse}
            className="-my-2 min-h-11 shrink-0"
          >
            <IconSparkle size={15} />
            {t.home.anotherVerse}
          </GentleButton>
        )}
      </div>
      {/* Stable aria-live wrapper: "Another verse" swaps the content, and
          screen readers should hear the new verse without refocusing. */}
      <div aria-live="polite">
        {/* Keyed by verse: a new pick settles in gently instead of snapping. */}
        <motion.div
          key={verse.id}
          variants={riseIn}
          initial="hidden"
          animate="visible"
        >
          <blockquote className="verse-text verse-text-lead mt-3">
            “{cleanVerseText(verse.text)}”
          </blockquote>
          <cite className="mt-4 block text-[0.9375rem] not-italic text-ash">
            — {verse.reference} <span className="text-fog">·</span> World English Bible
          </cite>
        </motion.div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <GentleButton
          variant="ghost"
          size="sm"
          onClick={() => {
            const nowSaved = toggleBookmark({
              bookSlug: verse.bookSlug,
              bookName,
              chapter: verse.chapter,
              verse: verse.verseStart,
              text: verse.text,
            });
            toast(nowSaved ? "Saved to your verses." : "Removed from your verses.");
          }}
        >
          {saved ? (
            <IconBookmarkFilled size={17} className="text-accent" />
          ) : (
            <IconBookmark size={17} />
          )}
          {saved ? "Saved" : "Save"}
        </GentleButton>
        <GentleLink
          variant="text"
          href={`/app/reflection/new?verse=${encodeURIComponent(verse.reference)}`}
        >
          Reflect on this
        </GentleLink>
      </div>
    </PaperCard>
  );
}
