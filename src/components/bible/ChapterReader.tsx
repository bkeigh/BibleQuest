"use client";

/**
 * Translation-aware chapter reader. Opening a chapter records reading progress,
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
import { ApiBibleViewTracker } from "@/components/bible/ApiBibleViewTracker";
import { usePreferredBibleChapter } from "@/lib/bible/use-preferred-scripture";
import {
  isRedistributableBibleTranslation,
  LOCAL_WEB_TRANSLATION_KEY,
} from "@/lib/bible/translations";

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

function ReaderInner({
  content,
  translationOverride,
}: {
  content: ChapterContent;
  translationOverride?: string;
}) {
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
  const resolved = usePreferredBibleChapter(content, translationOverride);
  const mayPersistEffectiveText = isRedistributableBibleTranslation(
    resolved.effectiveTranslation,
  );

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
    if (resolved.loading) return;
    let frame = 0;

    function applyLocationTarget() {
      const range = targetFromLocation(resolved.verses.length);
      setTargeted(range);
      if (!range) return;
      setFocusedVerse(range.start);
      // RecentVerse does not yet carry edition provenance, so its synced text
      // remains the bundled WEB snapshot. Bookmarks do retain reviewed open
      // edition keys and wording through the separate save action below.
      const safeSnapshot = content.verses.slice(range.start - 1, range.end);
      if (
        safeSnapshot.length === range.end - range.start + 1 &&
        safeSnapshot.every(Boolean)
      ) {
        recordRecentVerse({
          bookSlug: content.bookSlug,
          bookName: content.bookName,
          chapter: content.chapter,
          verseStart: range.start,
          verseEnd: range.end,
          reference: `${content.bookName} ${content.chapter}:${range.start}${
            range.end > range.start ? `–${range.end}` : ""
          }`,
          text: safeSnapshot.join(" "),
        });
      }
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
    resolved.loading,
    resolved.verses,
  ]);

  const bookmarkedVerses = new Set(
    bookmarks
      .filter(
        (b) =>
          b.bookSlug === content.bookSlug &&
          b.chapter === content.chapter &&
          (b.translationKey ?? "web") === resolved.effectiveTranslation.key,
      )
      .map((b) => b.verse)
  );

  const prev = content.chapter > 1 ? content.chapter - 1 : null;
  const next = content.chapter < content.chapterCount ? content.chapter + 1 : null;
  const editionQuery = translationOverride
    ? `?translation=${encodeURIComponent(translationOverride)}`
    : "";

  function moveVerseFocus(nextVerse: number) {
    const bounded = Math.min(resolved.verses.length, Math.max(1, nextVerse));
    setFocusedVerse(bounded);
    window.requestAnimationFrame(() => verseRefs.current[bounded - 1]?.focus());
  }

  function persistableVerseText(index: number): string | undefined {
    const text = mayPersistEffectiveText
      ? resolved.verses[index]
      : content.verses[index];
    return text?.trim() ? text : undefined;
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
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-right text-[0.75rem] text-ash"
        >
          {resolved.loading
            ? `World English Bible · checking ${resolved.preferredTranslation?.abbreviation ?? "saved edition"}…`
            : (
                <span
                  dir={resolved.effectiveTranslation.direction}
                  lang={resolved.effectiveTranslation.languageId}
                >
                  {resolved.effectiveTranslation.name}
                </span>
              )}
        </span>
      </div>

      <h1 className="mt-5 font-display text-editorial text-graphite">
        {content.bookName} {content.chapter}
      </h1>

      {!resolved.loading &&
        resolved.fallbackReason &&
        resolved.requestedKey !== LOCAL_WEB_TRANSLATION_KEY && (
          <p className="mt-2 rounded-[10px] bg-linen px-3 py-2 text-caption leading-relaxed text-ash">
            {resolved.preferredTranslation?.abbreviation ?? "Your preferred edition"}{" "}
            preferred · {resolved.effectiveTranslation.abbreviation} shown{" "}
            {resolved.preferredTranslation?.source === "helloao"
              ? "because the open online edition could not be loaded."
              : resolved.fallbackReason === "content_unavailable"
                ? "because the preferred text could not be loaded."
                : "because its licensed connection is unavailable."}
          </p>
        )}
      <ApiBibleViewTracker token={resolved.fumsToken} />

      {/* Verses remain continuous text, while a roving Tab stop avoids forcing
          keyboard users through every verse before they can leave the chapter. */}
      <div
        className="measure-reading mt-5"
        role="group"
        dir={resolved.effectiveTranslation.direction}
        lang={resolved.effectiveTranslation.languageId}
        aria-busy={resolved.loading}
        aria-label={`${content.bookName} ${content.chapter} verses`}
        aria-describedby={instructionsId}
      >
        <p id={instructionsId} className="sr-only">
          Use the arrow keys to move between verses. Press Enter or Space to
          select a verse and show its save action.
        </p>
        {resolved.verses.map((text, i) => {
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
              const safeVerseText = content.verses[i]?.trim();
              if (safeVerseText) {
                recordRecentVerse({
                  bookSlug: content.bookSlug,
                  bookName: content.bookName,
                  chapter: content.chapter,
                  verseStart: num,
                  verseEnd: num,
                  reference: `${content.bookName} ${content.chapter}:${num}`,
                  // RecentVerse has no translation key, so retain WEB here.
                  text: safeVerseText,
                });
              }
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
              tabIndex={!resolved.loading && focusedVerse === num ? 0 : -1}
              aria-disabled={resolved.loading || undefined}
              aria-pressed={isSel}
              aria-current={isTargeted ? "location" : undefined}
              onClick={() => {
                if (!resolved.loading) toggle();
              }}
              onFocus={() => setFocusedVerse(num)}
              onKeyDown={(e) => {
                if (resolved.loading) return;
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
                  moveVerseFocus(resolved.verses.length);
                }
              }}
              className={cn(
                "scroll-mt-28 rounded transition-colors",
                resolved.loading ? "cursor-wait" : "cursor-pointer",
                isSel && "bg-gold-500/20",
                isTargeted && !isSel && "bg-gold-500/15 ring-1 ring-gold-500/35",
                isSaved && !isSel && !isTargeted && "bg-gold-500/10"
              )}
            >
              <span className="verse-number">{num}</span>
              <span
                className="verse-text"
                dir={resolved.effectiveTranslation.direction}
                lang={resolved.effectiveTranslation.languageId}
              >
                {text || "This verse is presented in this edition’s notes."}{" "}
              </span>
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
              const safeVerseText = persistableVerseText(selected - 1);
              if (!safeVerseText) return;
              const nowSaved = toggleBookmark({
                bookSlug: content.bookSlug,
                bookName: content.bookName,
                chapter: content.chapter,
                verse: selected,
                // Keep licensed provider text transient; reviewed open
                // editions can be saved with their own edition key.
                text: safeVerseText,
                translationKey: resolved.effectiveTranslation.key,
              });
              toast(nowSaved ? "Verse saved." : "Removed.");
            }}
            aria-pressed={bookmarkedVerses.has(selected)}
            disabled={
              resolved.loading || !persistableVerseText(selected - 1)
            }
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-accent"
          >
            {bookmarkedVerses.has(selected) ? (
              <IconBookmarkFilled size={16} />
            ) : (
              <IconBookmark size={16} />
            )}
            {resolved.loading
              ? "Loading…"
              : !persistableVerseText(selected - 1)
                ? "Not available to save"
              : bookmarkedVerses.has(selected)
                ? "Saved"
                : "Save"}
          </button>
        </div>
      )}

      {/* Chapter navigation */}
      <div className="mt-8 flex items-center justify-between gap-3 pb-8">
        {prev ? (
          <GentleLink
            variant="ghost"
            size="sm"
            href={`/app/bible/${content.bookSlug}/${prev}${editionQuery}`}
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
            href={`/app/bible/${content.bookSlug}/${next}${editionQuery}`}
          >
            Chapter {next} <IconArrowRight size={16} />
          </GentleLink>
        ) : (
          <span />
        )}
      </div>
      {resolved.effectiveTranslation.copyright &&
        resolved.effectiveTranslation.key !== LOCAL_WEB_TRANSLATION_KEY && (
          <p
            className="-mt-4 pb-8 text-caption leading-relaxed text-ash"
            dir={resolved.effectiveTranslation.direction}
            lang={resolved.effectiveTranslation.languageId}
          >
            {resolved.effectiveTranslation.copyright}
            {resolved.effectiveTranslation.licenseUrl && (
              <>
                {" "}
                <a
                  href={resolved.effectiveTranslation.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                  lang="en"
                  className="underline decoration-fog underline-offset-2 hover:text-charcoal"
                >
                  Source &amp; license
                </a>
              </>
            )}
          </p>
        )}
    </div>
  );
}

export function ChapterReader({
  content,
  translationOverride,
}: {
  content: ChapterContent;
  translationOverride?: string;
}) {
  return (
    <ClientOnly>
      <ReaderInner
        content={content}
        translationOverride={translationOverride}
      />
    </ClientOnly>
  );
}
