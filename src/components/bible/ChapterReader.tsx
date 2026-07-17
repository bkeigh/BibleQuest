"use client";

/**
 * Interactive WEB chapter reader. Opening a chapter records reading progress,
 * and keyboard-accessible verse selection lets the shared QuestOS store add or
 * remove bookmarks without moving Scripture text out of its reading layout.
 */
import { useEffect, useId, useRef, useState } from "react";
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

interface VerseRange {
  start: number;
  end: number;
}

function parseRange(value: string | null, verseCount: number): VerseRange | null {
  if (!value) return null;
  const match = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(value);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start < 1 || end < start || end > verseCount) return null;
  return { start, end };
}

function targetFromLocation(verseCount: number): VerseRange | null {
  const queryRange = parseRange(
    new URLSearchParams(window.location.search).get("verse"),
    verseCount
  );
  const hashMatch = /^#verse-(\d{1,3})$/.exec(window.location.hash);
  const hashVerse = hashMatch ? Number(hashMatch[1]) : null;
  if (hashVerse && hashVerse >= 1 && hashVerse <= verseCount) {
    if (
      queryRange &&
      hashVerse >= queryRange.start &&
      hashVerse <= queryRange.end
    ) {
      return queryRange;
    }
    return { start: hashVerse, end: hashVerse };
  }
  return queryRange;
}

function ReaderInner({ content }: { content: ChapterContent }) {
  const { toast } = useToast();
  const bookmarks = useQuestOS((s) => s.bookmarks);
  const toggleBookmark = useQuestOS((s) => s.toggleBookmark);
  const recordRecentVerse = useQuestOS((s) => s.recordRecentVerse);
  const markChapterRead = useQuestOS((s) => s.markChapterRead);
  const setReadingPosition = useQuestOS((s) => s.setReadingPosition);
  const [selected, setSelected] = useState<number | null>(null);
  const [focusedVerse, setFocusedVerse] = useState(1);
  const [targeted, setTargeted] = useState<VerseRange | null>(null);
  const verseRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const instructionsId = useId();

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

  // Public share links and in-app recent-verse links identify a stable verse
  // with both ?verse=7-8 and #verse-7. Focus the first verse for assistive
  // technology, highlight the range, and honor both OS/app reduced motion.
  useEffect(() => {
    let frame = 0;

    function applyLocationTarget() {
      const range = targetFromLocation(content.verses.length);
      setTargeted(range);
      if (!range) return;
      setFocusedVerse(range.start);
      recordRecentVerse({
        bookSlug: content.bookSlug,
        bookName: content.bookName,
        chapter: content.chapter,
        verseStart: range.start,
        verseEnd: range.end,
        reference: `${content.bookName} ${content.chapter}:${range.start}${
          range.end > range.start ? `–${range.end}` : ""
        }`,
        text: content.verses.slice(range.start - 1, range.end).join(" "),
      });
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const node = verseRefs.current[range.start - 1];
        if (!node) return;
        const still =
          window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
          document.documentElement.classList.contains("force-reduce-motion");
        node.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
        node.focus({ preventScroll: true });
      });
    }

    applyLocationTarget();
    window.addEventListener("hashchange", applyLocationTarget);
    window.addEventListener("popstate", applyLocationTarget);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", applyLocationTarget);
      window.removeEventListener("popstate", applyLocationTarget);
    };
  }, [
    content.bookSlug,
    content.bookName,
    content.chapter,
    content.verses,
    recordRecentVerse,
  ]);

  const bookmarkedVerses = new Set(
    bookmarks
      .filter((b) => b.bookSlug === content.bookSlug && b.chapter === content.chapter)
      .map((b) => b.verse)
  );

  const prev = content.chapter > 1 ? content.chapter - 1 : null;
  const next = content.chapter < content.chapterCount ? content.chapter + 1 : null;

  function moveVerseFocus(nextVerse: number) {
    const bounded = Math.min(content.verses.length, Math.max(1, nextVerse));
    setFocusedVerse(bounded);
    window.requestAnimationFrame(() => verseRefs.current[bounded - 1]?.focus());
  }

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

      {/* Verses remain continuous text, while a roving Tab stop avoids forcing
          keyboard users through every verse before they can leave the chapter. */}
      <div
        className="measure-reading mt-5"
        role="group"
        aria-label={`${content.bookName} ${content.chapter} verses`}
        aria-describedby={instructionsId}
      >
        <p id={instructionsId} className="sr-only">
          Use the arrow keys to move between verses. Press Enter or Space to
          select a verse and show its save action.
        </p>
        {content.verses.map((text, i) => {
          const num = i + 1;
          const isSel = selected === num;
          const isSaved = bookmarkedVerses.has(num);
          const isTargeted = Boolean(
            targeted && num >= targeted.start && num <= targeted.end
          );
          const toggle = () => {
            setFocusedVerse(num);
            setSelected(isSel ? null : num);
            if (!isSel) {
              recordRecentVerse({
                bookSlug: content.bookSlug,
                bookName: content.bookName,
                chapter: content.chapter,
                verseStart: num,
                verseEnd: num,
                reference: `${content.bookName} ${content.chapter}:${num}`,
                text,
              });
            }
          };
          return (
            <span
              key={num}
              ref={(node) => {
                verseRefs.current[i] = node;
              }}
              id={`verse-${num}`}
              role="button"
              tabIndex={focusedVerse === num ? 0 : -1}
              aria-pressed={isSel}
              aria-current={isTargeted ? "location" : undefined}
              onClick={toggle}
              onFocus={() => setFocusedVerse(num)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  moveVerseFocus(num + 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  moveVerseFocus(num - 1);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  moveVerseFocus(1);
                } else if (e.key === "End") {
                  e.preventDefault();
                  moveVerseFocus(content.verses.length);
                }
              }}
              className={cn(
                "scroll-mt-28 cursor-pointer rounded transition-colors",
                isSel && "bg-gold-500/20",
                isTargeted && !isSel && "bg-gold-500/15 ring-1 ring-gold-500/35",
                isSaved && !isSel && !isTargeted && "bg-gold-500/10"
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
