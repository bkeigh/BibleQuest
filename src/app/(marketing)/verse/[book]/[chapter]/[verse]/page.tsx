import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadChapter } from "@/lib/bible/server";
import { fetchHelloAoPassage } from "@/lib/bible/helloao";
import { providerBookId } from "@/lib/bible/provider-books";
import {
  WEB_TRANSLATION,
  translationMetadata,
  type BibleTranslation,
} from "@/lib/bible/translations";
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
  translation: BibleTranslation;
}

const MAX_SHARED_VERSE_NUMBER = 200;

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

export async function resolveSharedVerse(
  bookSlug: string,
  chapterValue: string,
  verseValue: string,
  translationKey: string,
): Promise<SharedVerse | null> {
  const chapter = Number(chapterValue);
  if (!Number.isInteger(chapter)) return null;
  const content = await loadChapter(bookSlug, chapter);
  if (!content) return null;
  // Provider editions can contain a different canonical verse count. Parse
  // against a hard public bound first, then validate against the edition that
  // actually supplies the wording below.
  const range = parseVerseSegment(verseValue, MAX_SHARED_VERSE_NUMBER);
  if (!range) return null;

  const verseSegment =
    range.end > range.start ? `${range.start}-${range.end}` : `${range.start}`;
  const reference = `${content.bookName} ${chapter}:${range.start}${
    range.end > range.start ? `–${range.end}` : ""
  }`;
  const hasWebRange = range.end <= content.verses.length;
  let text = hasWebRange
    ? cleanVerseText(
        content.verses.slice(range.start - 1, range.end).join(" "),
      )
    : "";
  let translation = WEB_TRANSLATION;
  const requestedTranslation = translationMetadata(translationKey);
  const bookId = providerBookId(bookSlug);
  if (
    requestedTranslation?.source === "helloao" &&
    requestedTranslation.availability === "open" &&
    bookId &&
    range.end - range.start <= 7
  ) {
    try {
      const open = await fetchHelloAoPassage(
        requestedTranslation.key,
        bookId,
        chapter,
        range.start,
        range.end,
      );
      text = cleanVerseText(open.text);
      translation = open.translation;
    } catch {
      // A range present in WEB can fall back honestly during an outage; a
      // provider-only range cannot be represented and therefore returns 404.
    }
  }

  if (!text) return null;
  return {
    bookSlug,
    bookName: content.bookName,
    chapter,
    verseStart: range.start,
    verseEnd: range.end,
    verseSegment,
    reference,
    text,
    translation,
  };
}

/** Deduplicates the chapter file read shared by metadata and page rendering. */
const getSharedVerse = cache(resolveSharedVerse);

type RouteProps = {
  params: Promise<{ book: string; chapter: string; verse: string }>;
  searchParams: Promise<{ translation?: string | string[] }>;
};

function requestedTranslationKey(value: string | string[] | undefined): string {
  if (typeof value !== "string") return "";
  const translation = translationMetadata(value);
  return translation?.source === "helloao" ? translation.key : "";
}

export async function generateMetadata({
  params,
  searchParams,
}: RouteProps): Promise<Metadata> {
  const { book, chapter, verse } = await params;
  const query = await searchParams;
  const shared = await getSharedVerse(
    book,
    chapter,
    verse,
    requestedTranslationKey(query.translation),
  );
  if (!shared) return { title: "Verse not found" };

  const editionQuery =
    shared.translation.source === "helloao"
      ? `?translation=${encodeURIComponent(shared.translation.key)}`
      : "";
  const path = `/verse/${shared.bookSlug}/${shared.chapter}/${shared.verseSegment}${editionQuery}`;
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

export default async function SharedVersePage({
  params,
  searchParams,
}: RouteProps) {
  const { book, chapter, verse } = await params;
  const query = await searchParams;
  const shared = await getSharedVerse(
    book,
    chapter,
    verse,
    requestedTranslationKey(query.translation),
  );
  if (!shared) notFound();

  const editionQuery =
    shared.translation.source === "helloao"
      ? `translation=${encodeURIComponent(shared.translation.key)}&`
      : "";
  const chapterHref = `/app/bible/${shared.bookSlug}/${shared.chapter}?${editionQuery}verse=${shared.verseSegment}#verse-${shared.verseStart}`;

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pb-24 pt-32 sm:px-8">
      <div className="mb-4 flex items-center gap-2 text-caption uppercase tracking-[0.14em] text-accent">
        <PixelIcon name="open-book" size={3} /> Shared Scripture
      </div>

      <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden">
        <blockquote
          className="verse-text verse-text-lead"
          dir={shared.translation.direction}
          lang={shared.translation.languageId}
        >
          “{shared.text}”
        </blockquote>
        <cite className="mt-2.5 block text-[0.875rem] not-italic text-ash">
          — {shared.reference} <span className="text-fog">·</span>{" "}
          <span
            dir={shared.translation.direction}
            lang={shared.translation.languageId}
          >
            {shared.translation.name}
          </span>
        </cite>
        {shared.translation.licenseUrl && (
          <a
            href={shared.translation.licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-11 items-center text-caption text-ash underline decoration-fog underline-offset-2 hover:text-charcoal"
          >
            Source &amp; license
          </a>
        )}
      </PaperCard>

      <div className="mt-7">
        <h1 className="font-display text-[1.5rem] leading-tight text-graphite">
          Read it in context
        </h1>
        <p className="mt-2 max-w-xl text-small leading-relaxed text-charcoal">
          This open Scripture passage was shared from BibleQuest, a quiet
          companion for Scripture, prayer, reflection, and meaningful action.
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
