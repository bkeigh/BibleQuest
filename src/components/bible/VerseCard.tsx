"use client";

import type { DailyVerse } from "@/lib/questos/types";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { IconBookmark, IconBookmarkFilled, IconLeaf } from "@/components/design-system/icons";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { cleanVerseText } from "@/lib/utils/scripture";

/**
 * VerseCard — today's verse as a devotional card / margin note.
 */
export function VerseCard({ verse }: { verse: DailyVerse }) {
  const { toast } = useToast();
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
      <p className="text-[0.75rem] uppercase tracking-[0.18em] text-olive-500">
        Today’s Verse
      </p>
      <blockquote className="verse-text mt-3 text-[1.25rem] leading-relaxed">
        “{cleanVerseText(verse.text)}”
      </blockquote>
      <cite className="mt-4 block text-[0.9375rem] not-italic text-ash">
        — {verse.reference} <span className="text-fog">·</span> World English Bible
      </cite>
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
            <IconBookmarkFilled size={17} className="text-olive-500" />
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
