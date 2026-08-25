"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
} from "@/components/design-system/icons";
import { riseIn } from "@/lib/motion";
import { useQuestOS } from "@/lib/questos/store";
import type { BibleBookMeta } from "@/lib/questos/types";
import { cn } from "@/lib/utils/cn";
import { useHydrated } from "@/lib/utils/useHydrated";
import { chapterHref } from "@/lib/bible/links";

type BookSummary = Pick<
  BibleBookMeta,
  "slug" | "name" | "testament" | "chapterCount"
>;

function isChapterInBook(chapter: number, chapterCount: number): boolean {
  return (
    Number.isInteger(chapter) && chapter >= 1 && chapter <= chapterCount
  );
}

export function BookChapterPicker({ book }: { book: BookSummary }) {
  const readingPosition = useQuestOS((state) => state.readingPosition);
  const chaptersRead = useQuestOS((state) => state.chaptersRead);
  const hydrated = useHydrated();

  // Persisted reading state appears only after hydration, keeping the first
  // server and client renders identical while the useful page shell stays visible.
  const currentChapter =
    hydrated &&
    readingPosition?.bookSlug === book.slug &&
    isChapterInBook(readingPosition.chapter, book.chapterCount)
      ? readingPosition.chapter
      : null;
  const readChapters = useMemo(
    () =>
      new Set(
        hydrated
          ? chaptersRead
              .filter(
                (entry) =>
                  entry.bookSlug === book.slug &&
                  isChapterInBook(entry.chapter, book.chapterCount),
              )
              .map((entry) => entry.chapter)
          : [],
      ),
    [book.chapterCount, book.slug, chaptersRead, hydrated],
  );

  const lastReadChapter = useMemo(() => {
    if (!hydrated) return null;
    for (let index = chaptersRead.length - 1; index >= 0; index -= 1) {
      const entry = chaptersRead[index];
      if (
        entry.bookSlug === book.slug &&
        isChapterInBook(entry.chapter, book.chapterCount)
      ) {
        return entry.chapter;
      }
    }
    return null;
  }, [book.chapterCount, book.slug, chaptersRead, hydrated]);

  // Only call an exact saved position "Continue"; older history is offered as
  // a return point, and a new book begins honestly at chapter one.
  const actionChapter = currentChapter ?? lastReadChapter ?? 1;
  const actionLabel = currentChapter
    ? "Continue reading"
    : lastReadChapter
      ? "Return to this book"
      : "Begin reading";
  const progress = (readChapters.size / book.chapterCount) * 100;
  const testamentLabel = book.testament === "old" ? "Old" : "New";

  return (
    <PageContainer className="pt-safe">
      <div className="pt-4 sm:pt-6">
        <Link
          href="/app/bible"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> Bible
        </Link>
      </div>

      <header className="mt-2 sm:mt-3">
        <p className="font-art-label text-caption uppercase tracking-[0.08em] text-accent">
          {testamentLabel} Testament
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h1 className="font-display text-[2rem] leading-tight text-graphite sm:text-heading">
            {book.name}
          </h1>
          <p className="pb-0.5 text-caption text-ash">
            {book.chapterCount} {book.chapterCount === 1 ? "chapter" : "chapters"}
          </p>
        </div>
      </header>

      <motion.div
        variants={riseIn}
        initial="hidden"
        animate="visible"
        className="mt-5"
      >
        <Link
          href={chapterHref(book.slug, actionChapter)}
          aria-label={`${actionLabel}: ${book.name} chapter ${actionChapter}`}
          className="group block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <PaperCard
            interactive
            variant="atmospheric"
            padding="md"
            className="flex items-center gap-4"
          >
            <span className="flex shrink-0 items-center justify-center">
              <ArtIcon name="open-book" size={52} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-caption uppercase tracking-[0.14em] text-accent">
                {actionLabel}
              </span>
              <span className="mt-0.5 block font-display text-subheading text-graphite">
                {book.name} {actionChapter}
              </span>
              <span className="mt-1 block text-caption text-ash">
                {currentChapter
                  ? "Pick up where you left off."
                  : lastReadChapter
                    ? "Return to a chapter you’ve read."
                    : "Start with the first chapter."}
              </span>
            </span>
            <IconArrowRight className="shrink-0 text-accent transition-transform duration-300 group-hover:translate-x-0.5" />
          </PaperCard>
        </Link>
      </motion.div>

      <section aria-labelledby="chapter-picker-title" className="mt-7 pb-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2
              id="chapter-picker-title"
              className="font-display text-subheading text-graphite"
            >
              Choose a chapter
            </h2>
            <p className="mt-1 text-caption text-ash">
              {readChapters.size === 0
                ? "Your reading progress will appear here."
                : `${readChapters.size} of ${book.chapterCount} chapters read`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[0.75rem] text-ash">
            {currentChapter && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
                Current
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <IconCheck size={13} className="text-accent" />
              Read
            </span>
          </div>
        </div>

        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist/60"
          role="progressbar"
          aria-label={`${book.name} reading progress`}
          aria-valuemin={0}
          aria-valuemax={book.chapterCount}
          aria-valuenow={readChapters.size}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 [transition-timing-function:var(--ease-gentle)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <motion.ul
          variants={riseIn}
          initial="hidden"
          animate="visible"
          aria-label={`${book.name} chapters`}
          className="mt-4 grid grid-cols-4 gap-2.5 min-[360px]:grid-cols-5 sm:grid-cols-7"
        >
          {Array.from({ length: book.chapterCount }, (_, index) => index + 1).map(
            (chapter) => {
              const isCurrent = chapter === currentChapter;
              const isRead = readChapters.has(chapter);
              const stateLabel = isCurrent
                ? isRead
                  ? ", current chapter, read"
                  : ", current chapter"
                : isRead
                  ? ", read"
                  : "";

              return (
                <li key={chapter}>
                  <Link
                    href={chapterHref(book.slug, chapter)}
                    aria-label={`${book.name} chapter ${chapter}${stateLabel}`}
                    aria-current={isCurrent ? "step" : undefined}
                    className={cn(
                      "relative flex aspect-square min-h-12 items-center justify-center overflow-hidden rounded-[10px] border text-[1rem] transition-all duration-300 [transition-timing-function:var(--ease-gentle)]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      isCurrent
                        ? "border-evergreen-700 bg-evergreen-700 font-medium text-[#fdfbf3] paper-shadow"
                        : isRead
                          ? "border-accent/30 bg-accent-surface font-medium text-accent hover:border-accent/55"
                          : "border-mist bg-paper text-charcoal hover:border-accent/40 hover:bg-linen hover:text-accent",
                    )}
                  >
                    <span>{chapter}</span>
                    {isRead && !isCurrent && (
                      <IconCheck
                        size={12}
                        className="absolute right-1 top-1 text-accent"
                      />
                    )}
                    {isCurrent && (
                      <span
                        className="absolute inset-x-2 bottom-1.5 h-0.5 bg-gold-300"
                        aria-hidden
                      />
                    )}
                  </Link>
                </li>
              );
            },
          )}
        </motion.ul>
      </section>
    </PageContainer>
  );
}
