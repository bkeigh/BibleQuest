"use client";

/**
 * Interactive WEB chapter reader. Opening a chapter records reading progress,
 * and keyboard-accessible verse selection lets the shared QuestOS store add or
 * remove bookmarks without moving Scripture text out of its reading layout.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { GentleLink } from "@/components/design-system/GentleButton";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBookmark,
  IconBookmarkFilled,
} from "@/components/design-system/icons";
import type { ChapterContent } from "@/lib/bible/server";
import { cn } from "@/lib/utils/cn";

function ReaderInner({ content }: { content: ChapterContent }) {
  const { toast } = useToast();
  const bookmarks = useQuestOS((s) => s.bookmarks);
  const toggleBookmark = useQuestOS((s) => s.toggleBookmark);
  const markChapterRead = useQuestOS((s) => s.markChapterRead);
  const setReadingPosition = useQuestOS((s) => s.setReadingPosition);
  const [selected, setSelected] = useState<number | null>(null);

  // Record reading position + chapter read on open.
  useEffect(() => {
    setReadingPosition({
      bookSlug: content.bookSlug,
      bookName: content.bookName,
      chapter: content.chapter,
    });
    markChapterRead(content.bookSlug, content.bookName, content.chapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.bookSlug, content.chapter]);

  const bookmarkedVerses = new Set(
    bookmarks
      .filter((b) => b.bookSlug === content.bookSlug && b.chapter === content.chapter)
      .map((b) => b.verse)
  );

  const prev = content.chapter > 1 ? content.chapter - 1 : null;
  const next = content.chapter < content.chapterCount ? content.chapter + 1 : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-safe sm:px-8">
      {/* Header */}
      <div className="flex items-center justify-between pt-6">
        <Link
          href={`/app/bible/${content.bookSlug}`}
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> {content.bookName}
        </Link>
        <span className="text-[0.75rem] text-ash">World English Bible</span>
      </div>

      <h1 className="mt-5 font-display text-editorial text-graphite">
        {content.bookName} {content.chapter}
      </h1>

      {/* Verses — each verse is a toggle so keyboard and screen-reader users
          can select and save, not just mouse users. Spans (not <button>s)
          keep Scripture flowing as continuous text. */}
      <div className="measure-reading mt-5">
        {content.verses.map((text, i) => {
          const num = i + 1;
          const isSel = selected === num;
          const isSaved = bookmarkedVerses.has(num);
          const toggle = () => setSelected(isSel ? null : num);
          return (
            <span
              key={num}
              role="button"
              tabIndex={0}
              aria-pressed={isSel}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }}
              className={cn(
                "cursor-pointer rounded transition-colors",
                isSel && "bg-gold-500/20",
                isSaved && !isSel && "bg-gold-500/10"
              )}
            >
              <span className="verse-number">{num}</span>
              <span className="verse-text">{text} </span>
              {isSaved && <span className="sr-only">(saved)</span>}
            </span>
          );
        })}
      </div>

      {/* Verse action bar */}
      {selected !== null && (
        <div className="sticky bottom-24 z-10 mt-6 flex items-center justify-between rounded-full border border-mist bg-paper px-4 py-2.5 paper-shadow-lg">
          <span className="text-[0.875rem] text-ash">
            {content.bookName} {content.chapter}:{selected}
          </span>
          <button
            onClick={() => {
              const nowSaved = toggleBookmark({
                bookSlug: content.bookSlug,
                bookName: content.bookName,
                chapter: content.chapter,
                verse: selected,
                text: content.verses[selected - 1],
              });
              toast(nowSaved ? "Verse saved." : "Removed.");
            }}
            aria-pressed={bookmarkedVerses.has(selected)}
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-accent"
          >
            {bookmarkedVerses.has(selected) ? (
              <IconBookmarkFilled size={16} />
            ) : (
              <IconBookmark size={16} />
            )}
            {bookmarkedVerses.has(selected) ? "Saved" : "Save"}
          </button>
        </div>
      )}

      {/* Chapter navigation */}
      <div className="mt-8 flex items-center justify-between gap-3 pb-8">
        {prev ? (
          <GentleLink
            variant="ghost"
            size="sm"
            href={`/app/bible/${content.bookSlug}/${prev}`}
          >
            <IconArrowLeft size={16} /> Chapter {prev}
          </GentleLink>
        ) : (
          <span />
        )}
        {next ? (
          <GentleLink
            variant="ghost"
            size="sm"
            href={`/app/bible/${content.bookSlug}/${next}`}
          >
            Chapter {next} <IconArrowRight size={16} />
          </GentleLink>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

export function ChapterReader({ content }: { content: ChapterContent }) {
  return (
    <ClientOnly>
      <ReaderInner content={content} />
    </ClientOnly>
  );
}
