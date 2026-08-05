"use client";

/**
 * The native bundle's single chapter reader.
 *
 * The web app renders `/app/bible/<book>/<chapter>` on the server. A static
 * export has no server, and prerendering all 1189 chapters would add roughly
 * 57 MB of near-identical app shell to the binary (see `lib/bible/links.ts`),
 * so the iOS bundle ships one page that reads the chapter from the query
 * string and loads the text from a lazily imported book chunk.
 *
 * Two things here are load-bearing:
 *
 *   1. `useSearchParams` — tapping Next Chapter changes only the query, which
 *      Next handles as a soft navigation. The page never unmounts and neither
 *      `popstate` nor `hashchange` fires, so nothing else would observe the
 *      new chapter.
 *   2. The `key` on ChapterReader — the nested route gets a remount for free
 *      from its own route key. Without an equivalent here, verse selection,
 *      focus mode and reading progress would leak across chapters.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChapterReader } from "@/components/bible/ChapterReader";
import { ChapterSkeleton } from "@/components/bible/ChapterSkeleton";
import { GentleLink } from "@/components/design-system/GentleButton";
import { loadChapterClient } from "@/lib/bible/client";
import { bibleTranslationKey } from "@/lib/bible/translations";
import type { ChapterContent } from "@/lib/bible/chapter-content";

/** A resolved chapter, tagged with the request it answers. */
interface Resolved {
  key: string;
  content: ChapterContent | null;
}

export function ChapterReaderRoute() {
  const searchParams = useSearchParams();
  const book = searchParams.get("book") ?? "";
  const chapterParam = searchParams.get("chapter") ?? "";
  const translation = bibleTranslationKey(
    searchParams.get("translation") ?? undefined,
  );

  const chapter = Number(chapterParam);
  const requestKey = `${book}:${chapter}`;
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    let active = true;

    loadChapterClient(book, chapter)
      .then((content) => {
        if (active) setResolved({ key: requestKey, content });
      })
      .catch(() => {
        if (active) setResolved({ key: requestKey, content: null });
      });

    return () => {
      active = false;
    };
  }, [book, chapter, requestKey]);

  // Tagging the result with its request means the skeleton returns the instant
  // the query changes, without resetting state from inside the effect — and a
  // fast run of chapter taps can never show an earlier chapter's text.
  const settled = resolved?.key === requestKey ? resolved : null;

  if (!settled) return <ChapterSkeleton />;

  if (!settled.content) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pt-safe sm:px-8">
        <div className="pt-16 text-center">
          <h1 className="text-title text-charcoal">That chapter isn’t here</h1>
          <p className="mx-auto mt-3 max-w-sm text-body text-ash">
            The passage couldn’t be opened. Choose a book and we’ll pick up
            where you left off.
          </p>
          <GentleLink href="/app/bible" variant="outline" className="mt-6">
            Back to the Bible
          </GentleLink>
        </div>
      </div>
    );
  }

  return (
    <ChapterReader
      key={requestKey}
      content={settled.content}
      translationOverride={translation}
    />
  );
}
