import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadChapter } from "@/lib/bible/server";
import { cleanVerseText } from "@/lib/utils/scripture";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconArrowRight } from "@/components/design-system/icons";

interface SharedVerse {
  bookSlug: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  verseSegment: string;
  reference: string;
  text: string;
}

function parseVerseSegment(
  segment: string,
  verseCount: number
): { start: number; end: number } | null {
  const match = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(segment);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start ||
    end > verseCount ||
    end - start > 11
  ) {
    return null;
  }
  return { start, end };
}

/** Deduplicates the chapter file read shared by metadata and page rendering. */
const getSharedVerse = cache(
  async (
    bookSlug: string,
    chapterValue: string,
    verseValue: string
  ): Promise<SharedVerse | null> => {
    const chapter = Number(chapterValue);
    if (!Number.isInteger(chapter)) return null;
    const content = await loadChapter(bookSlug, chapter);
    if (!content) return null;
    const range = parseVerseSegment(verseValue, content.verses.length);
    if (!range) return null;

    const verseSegment =
      range.end > range.start ? `${range.start}-${range.end}` : `${range.start}`;
    const reference = `${content.bookName} ${chapter}:${range.start}${
      range.end > range.start ? `–${range.end}` : ""
    }`;
    const text = cleanVerseText(
      content.verses.slice(range.start - 1, range.end).join(" ")
    );

    return {
      bookSlug,
      bookName: content.bookName,
      chapter,
      verseStart: range.start,
      verseEnd: range.end,
      verseSegment,
      reference,
      text,
    };
  }
);

type RouteProps = {
  params: Promise<{ book: string; chapter: string; verse: string }>;
};

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { book, chapter, verse } = await params;
  const shared = await getSharedVerse(book, chapter, verse);
  if (!shared) return { title: "Verse not found" };

  const path = `/verse/${shared.bookSlug}/${shared.chapter}/${shared.verseSegment}`;
  const description = `${shared.text.slice(0, 180)}${shared.text.length > 180 ? "…" : ""}`;
  return {
    title: shared.reference,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${shared.reference} — BibleQuest`,
      description,
      url: path,
      type: "article",
      siteName: "BibleQuest",
      images: [{ url: "/og.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${shared.reference} — BibleQuest`,
      description,
      images: ["/og.png"],
    },
  };
}

export default async function SharedVersePage({ params }: RouteProps) {
  const { book, chapter, verse } = await params;
  const shared = await getSharedVerse(book, chapter, verse);
  if (!shared) notFound();

  const chapterHref = `/app/bible/${shared.bookSlug}/${shared.chapter}?verse=${shared.verseSegment}#verse-${shared.verseStart}`;

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pb-24 pt-32 sm:px-8">
      <div className="mb-4 flex items-center gap-2 text-caption uppercase tracking-[0.14em] text-accent">
        <PixelIcon name="open-book" size={3} /> Shared Scripture
      </div>

      <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden">
        <blockquote className="verse-text verse-text-lead">
          “{shared.text}”
        </blockquote>
        <cite className="mt-2.5 block text-[0.875rem] not-italic text-ash">
          — {shared.reference} <span className="text-fog">·</span> World English Bible
        </cite>
      </PaperCard>

      <div className="mt-7">
        <h1 className="font-display text-[1.5rem] leading-tight text-graphite">
          Read it in context
        </h1>
        <p className="mt-2 max-w-xl text-small leading-relaxed text-charcoal">
          This public-domain passage was shared from BibleQuest, a quiet companion
          for Scripture, prayer, reflection, and meaningful action.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <GentleLink variant="primary" href={chapterHref}>
            Open {shared.bookName} {shared.chapter} <IconArrowRight />
          </GentleLink>
          <GentleLink variant="text" href="/onboarding">
            Start BibleQuest
          </GentleLink>
        </div>
      </div>
    </article>
  );
}
