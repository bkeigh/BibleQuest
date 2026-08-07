"use client";

/**
 * Translation-aware chapter reader. Opening a chapter records reading position;
 * finishing remains an explicit choice so navigation alone never grows the tree.
 * Keyboard-accessible verse selection keeps Scripture in its reading layout.
 */
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBookmark,
  IconBookmarkFilled,
  IconCheck,
  IconClose,
  IconEye,
  IconShare,
} from "@/components/design-system/icons";
import type { ChapterContent } from "@/lib/bible/chapter-content";
import { cn } from "@/lib/utils/cn";
import { ApiBibleViewTracker } from "@/components/bible/ApiBibleViewTracker";
import { usePreferredBibleChapter } from "@/lib/bible/use-preferred-scripture";
import {
  isRedistributableBibleTranslation,
  LOCAL_WEB_TRANSLATION_KEY,
} from "@/lib/bible/translations";
import { VerseShareSheet } from "@/components/bible/VerseShareSheet";
import { bookHref, chapterHref } from "@/lib/bible/links";
import { formatVerseShareText } from "@/lib/utils/scripture";
import { track } from "@/lib/analytics/events";
import { buildPublicUrl } from "@/lib/platform/api";

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
  const chaptersRead = useQuestOS((s) => s.chaptersRead);
  const toggleBookmark = useQuestOS((s) => s.toggleBookmark);
  const recordRecentVerse = useQuestOS((s) => s.recordRecentVerse);
  const markChapterRead = useQuestOS((s) => s.markChapterRead);
  const setReadingPosition = useQuestOS((s) => s.setReadingPosition);
  const [selected, setSelected] = useState<number | null>(null);
  const [focusedVerse, setFocusedVerse] = useState(1);
  const [targeted, setTargeted] = useState<VerseRange | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const verseRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const readingRef = useRef<HTMLDivElement>(null);
  const instructionsId = useId();
  const resolved = usePreferredBibleChapter(content, translationOverride);
  const mayPersistEffectiveText = isRedistributableBibleTranslation(
    resolved.effectiveTranslation,
  );

  // Navigation updates Continue Reading and analytics, but does not claim the
  // chapter was read. The intentional control after the text does that.
  useEffect(() => {
    setReadingPosition({
      bookSlug: content.bookSlug,
      bookName: content.bookName,
      chapter: content.chapter,
    });
    track("bible_chapter_opened");
  }, [
    content.bookName,
    content.bookSlug,
    content.chapter,
    setReadingPosition,
  ]);

  // Focus mode is page-scoped. The root class moves app chrome away, while
  // inert + aria-hidden keep its invisible links out of keyboard and assistive
  // technology navigation until the reader exits focus mode.
  useEffect(() => {
    const bottomNav = document.querySelector<HTMLElement>(
      "[data-app-bottom-nav]",
    );
    document.documentElement.classList.toggle("bible-focus-mode", focusMode);
    bottomNav?.toggleAttribute("inert", focusMode);
    if (focusMode) bottomNav?.setAttribute("aria-hidden", "true");
    else bottomNav?.removeAttribute("aria-hidden");

    return () => {
      document.documentElement.classList.remove("bible-focus-mode");
      bottomNav?.removeAttribute("inert");
      bottomNav?.removeAttribute("aria-hidden");
    };
  }, [focusMode]);

  // A slim progress line orients long-chapter readers without adding another
  // counter to the Scripture surface. Scroll work is coalesced to one frame.
  useEffect(() => {
    let frame = 0;
    function updateProgress() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const node = readingRef.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const viewport = window.innerHeight;
        const readableDistance = Math.max(1, rect.height - viewport * 0.45);
        const traveled = viewport * 0.32 - rect.top;
        const next = Math.min(1, Math.max(0, traveled / readableDistance));
        setReadingProgress((current) =>
          Math.abs(current - next) < 0.005 ? current : next,
        );
      });
    }
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [resolved.loading, resolved.verses.length]);

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
  const chapterRead = chaptersRead.some(
    (entry) =>
      entry.bookSlug === content.bookSlug && entry.chapter === content.chapter,
  );
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

  const selectedReference = selected
    ? `${content.bookName} ${content.chapter}:${selected}`
    : `${content.bookName} ${content.chapter}`;
  const selectedVerseText = selected
    ? persistableVerseText(selected - 1) ?? ""
    : "";
  const selectedShareText = formatVerseShareText(
    selectedVerseText,
    selectedReference,
  );
  const selectedSharePath = selected
    ? `/verse/${content.bookSlug}/${content.chapter}/${selected}${
        mayPersistEffectiveText &&
        resolved.effectiveTranslation.key !== LOCAL_WEB_TRANSLATION_KEY
          ? `?translation=${encodeURIComponent(resolved.effectiveTranslation.key)}`
          : ""
      }`
    : "/app/bible";

  function shareSelectedVerse() {
    if (!selected || !selectedVerseText) return;
    setShareUrl(buildPublicUrl(selectedSharePath));
    setShareSheetOpen(true);
  }

  return (
    <div
      className={cn(
        "mx-auto w-full px-5 pt-safe transition-[max-width] duration-500 sm:px-8",
        focusMode ? "max-w-3xl" : "max-w-2xl",
      )}
    >
      {/* The quiet top rail stays reachable in long chapters. Focus mode only
          removes app chrome; edition identity and an exit always remain. */}
      <header className="sticky top-[env(safe-area-inset-top)] z-20 -mx-5 border-b border-mist/70 bg-parchment/92 px-5 pt-3 pb-2 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Link
            href={bookHref(content.bookSlug)}
            aria-label={`Back to ${content.bookName} chapters`}
            className="inline-flex min-h-11 items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
          >
            <IconArrowLeft size={16} /> {content.bookName}
          </Link>
          <button
            type="button"
            aria-pressed={focusMode}
            onClick={() => setFocusMode((enabled) => !enabled)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium text-accent transition-colors hover:bg-accent-surface"
          >
            {focusMode ? <IconClose size={16} /> : <IconEye size={16} />}
            {focusMode ? "Exit focus" : "Focus"}
          </button>
        </div>
        <div
          role="progressbar"
          aria-label="Chapter reading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(readingProgress * 100)}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-mist/40"
        >
          <motion.div
            className="h-full origin-left bg-accent"
            animate={{ scaleX: readingProgress }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-editorial text-graphite">
          {content.bookName} {content.chapter}
        </h1>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="pb-0.5 text-right text-caption text-ash"
        >
          {resolved.loading ? (
            `WEB · checking ${resolved.preferredTranslation?.abbreviation ?? "saved edition"}…`
          ) : (
            <span
              dir={resolved.effectiveTranslation.direction}
              lang={resolved.effectiveTranslation.languageId}
            >
              {resolved.effectiveTranslation.name}
            </span>
          )}
        </span>
      </div>

      {!focusMode &&
        !resolved.loading &&
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
        ref={readingRef}
        className="measure-reading mx-auto mt-7 sm:mt-9"
        role="group"
        dir={resolved.effectiveTranslation.direction}
        lang={resolved.effectiveTranslation.languageId}
        aria-busy={resolved.loading}
        aria-label={`${content.bookName} ${content.chapter} verses`}
        aria-describedby={instructionsId}
      >
        <p id={instructionsId} className="sr-only">
          Use the arrow keys to move between verses. Press Enter or Space to
          select a verse and show its save, share, and reflection actions.
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
              const safeVerseText = persistableVerseText(i);
              if (safeVerseText) {
                recordRecentVerse({
                  bookSlug: content.bookSlug,
                  bookName: content.bookName,
                  chapter: content.chapter,
                  verseStart: num,
                  verseEnd: num,
                  reference: `${content.bookName} ${content.chapter}:${num}`,
                  // Open editions keep the wording the person actually read;
                  // licensed editions still fall back to the bundled WEB.
                  text: safeVerseText,
                });
              }
            }
          };
          return (
            <button
              type="button"
              key={num}
              ref={(node) => {
                verseRefs.current[i] = node;
              }}
              id={`verse-${num}`}
              tabIndex={!resolved.loading && focusedVerse === num ? 0 : -1}
              disabled={resolved.loading}
              aria-pressed={isSel}
              aria-current={isTargeted ? "location" : undefined}
              data-selected={isSel ? "true" : undefined}
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
                "inline scroll-mt-28 appearance-none border-0 bg-transparent p-0 text-left focus-visible:outline-none",
                resolved.loading ? "cursor-wait" : "cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "verse-mark box-decoration-clone rounded-[0.2em] px-[0.14em] pt-[0.06em] pb-[0.1em] transition-colors",
                  isSel && "verse-mark-selected",
                  isTargeted && !isSel && "verse-mark-targeted",
                  isSaved && !isSel && !isTargeted && "verse-mark-saved",
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
              </span>
              {isSaved && <span className="sr-only">(saved)</span>}
            </button>
          );
        })}
      </div>

      {/* Selection actions arrive as one stable surface; Scripture lines never
          move or animate individually when the toolbar opens. */}
      <AnimatePresence>
        {selected !== null && (
          <motion.div
            role="toolbar"
            aria-label={`Actions for ${selectedReference}`}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "sticky z-30 mt-7 rounded-[var(--radius-card)] border border-mist bg-paper/95 p-2.5 paper-shadow-lg backdrop-blur-md",
              focusMode
                ? "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
                : "bottom-[calc(6rem+env(safe-area-inset-bottom))]",
            )}
          >
            <div className="flex min-h-9 items-center justify-between gap-3 px-1.5">
              <span className="truncate text-caption font-medium text-graphite">
                {selectedReference}
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close verse actions"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ash transition-colors hover:bg-linen hover:text-charcoal"
              >
                <IconClose size={16} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => {
                  if (!selectedVerseText) return;
                  const nowSaved = toggleBookmark({
                    bookSlug: content.bookSlug,
                    bookName: content.bookName,
                    chapter: content.chapter,
                    verse: selected,
                    // Licensed wording remains transient; in that case the
                    // bookmark retains the safe bundled WEB snapshot.
                    text: selectedVerseText,
                    translationKey: resolved.effectiveTranslation.key,
                  });
                  toast(nowSaved ? "Verse saved." : "Removed.");
                }}
                aria-pressed={bookmarkedVerses.has(selected)}
                disabled={resolved.loading || !selectedVerseText}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[9px] px-2 text-small font-medium text-accent transition-colors hover:bg-accent-surface disabled:pointer-events-none disabled:opacity-50"
              >
                {bookmarkedVerses.has(selected) ? (
                  <IconBookmarkFilled size={16} />
                ) : (
                  <IconBookmark size={16} />
                )}
                {bookmarkedVerses.has(selected) ? "Saved" : "Save"}
              </button>
              <button
                type="button"
                onClick={shareSelectedVerse}
                disabled={resolved.loading || !selectedVerseText}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[9px] px-2 text-small font-medium text-charcoal transition-colors hover:bg-linen disabled:pointer-events-none disabled:opacity-50"
              >
                <IconShare size={16} /> Share
              </button>
              <Link
                href={`/app/prayer/reflection/new?verse=${encodeURIComponent(selectedReference)}`}
                className="inline-flex min-h-11 items-center justify-center rounded-[9px] px-2 text-small font-medium text-charcoal transition-colors hover:bg-linen"
              >
                Reflect
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Completion is intentional: reaching this point invites a choice, and
          re-marking the same chapter stays disabled and idempotent. */}
      <div className="app-glass-surface mt-9 rounded-[var(--radius-card)] border border-mist bg-paper p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-[0.9375rem] font-medium text-graphite">
            {chapterRead ? "Chapter marked as read" : "Finished this chapter?"}
          </p>
          <p className="mt-1 text-caption leading-relaxed text-ash">
            {chapterRead
              ? "This reading is already part of your Journey."
              : "Mark it when you are ready. It will tend your tree and reading milestones."}
          </p>
        </div>
        <GentleButton
          type="button"
          variant={chapterRead ? "ghost" : "primary"}
          size="sm"
          disabled={chapterRead}
          className="mt-3 shrink-0 sm:mt-0"
          onClick={() => {
            markChapterRead(content.bookSlug, content.bookName, content.chapter);
            toast("Chapter added to your Journey.", { variant: "success" });
          }}
        >
          <IconCheck size={17} /> {chapterRead ? "Read" : "Mark as read"}
        </GentleButton>
      </div>

      {/* Chapter navigation */}
      <div className="mt-8 flex items-center justify-between gap-3 pb-8">
        {prev ? (
          <GentleLink
            variant="ghost"
            size="sm"
            href={chapterHref(content.bookSlug, prev, {
              translation: translationOverride,
            })}
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
            href={chapterHref(content.bookSlug, next, {
              translation: translationOverride,
            })}
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
      <VerseShareSheet
        open={shareSheetOpen}
        title={`${selectedReference} — BibleQuest`}
        text={selectedShareText}
        url={shareUrl || selectedSharePath}
        notice={
          !resolved.loading && !mayPersistEffectiveText
            ? "The shared wording may differ from what you’re reading so licensed text stays inside BibleQuest."
            : undefined
        }
        onClose={() => setShareSheetOpen(false)}
      />
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
