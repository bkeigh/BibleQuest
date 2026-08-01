import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveSharedVerse } from "@/lib/bible/shared-verse";
import { translationMetadata } from "@/lib/bible/translations";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconArrowRight } from "@/components/design-system/icons";

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
        <PixelIcon name="open-book" size={56} /> Shared Scripture
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
