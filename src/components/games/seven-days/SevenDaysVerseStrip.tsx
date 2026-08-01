"use client";

import { useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconBookmark, IconBookmarkFilled } from "@/components/design-system/icons";
import { scriptureSourceHref } from "@/lib/games/links";
import type { SevenDaysVerse } from "@/lib/games/seven-days/verses";
import { useQuestOS } from "@/lib/questos/store";
import { cn } from "@/lib/utils/cn";

/**
 * The verse under the board.
 *
 * Drawn from the day being played, so the line under a Day 3 board is Day 3's
 * ground and seed, and fixed per level so it is a line you can come back to.
 *
 * Saving writes a bookmark — the one place this game touches anything outside
 * itself, and only because the reader asked. The board never writes anything;
 * tapping "Save" here is the same act as tapping it in the Bible, and it is
 * labelled so nobody does it by accident.
 */
export function SevenDaysVerseStrip({ verse }: { verse: SevenDaysVerse }) {
  const bookmarks = useQuestOS((state) => state.bookmarks);
  const toggleBookmark = useQuestOS((state) => state.toggleBookmark);
  const [announcement, setAnnouncement] = useState("");

  const saved = bookmarks.some(
    (bookmark) =>
      bookmark.bookSlug === verse.source.bookSlug &&
      bookmark.chapter === verse.source.chapter &&
      bookmark.verse === verse.source.verseStart,
  );

  return (
    <section
      aria-label="Verse for this level"
      className="app-glass-surface rounded-[var(--radius-card)] border border-mist bg-paper/70 px-3.5 py-3"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p className="verse-text text-[0.9375rem] leading-relaxed">{verse.text}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption font-medium text-gilt">
          {verse.source.reference}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={saved}
            onClick={() => {
              const nowSaved = toggleBookmark({
                bookSlug: verse.source.bookSlug,
                bookName: "Genesis",
                chapter: verse.source.chapter,
                verse: verse.source.verseStart,
                text: verse.text,
                translationKey: "web",
              });
              setAnnouncement(
                nowSaved
                  ? `${verse.source.reference} saved to your verses.`
                  : `${verse.source.reference} removed from your verses.`,
              );
            }}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] px-2.5 text-caption font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              saved ? "text-accent" : "text-charcoal hover:text-accent",
            )}
          >
            {saved ? (
              <IconBookmarkFilled size={15} />
            ) : (
              <IconBookmark size={15} />
            )}
            {saved ? "Saved" : "Save"}
          </button>
          <Link
            href={scriptureSourceHref(verse.source)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] px-2.5 text-caption font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Read <IconArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
