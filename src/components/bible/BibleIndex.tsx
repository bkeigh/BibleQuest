"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuestOS } from "@/lib/questos/store";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { oldTestament, newTestament } from "@/lib/bible/index";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { VerseCard } from "@/components/bible/VerseCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { IconChevronRight } from "@/components/design-system/icons";
import type { BibleBookMeta } from "@/lib/questos/types";
import { translationPreferenceLabel } from "@/lib/bible/translations";

function BibleIndexInner() {
  const readingPosition = useQuestOS((s) => s.readingPosition);
  const bookmarks = useQuestOS((s) => s.bookmarks);
  const verse = useMemo(() => getDailyVerse(), []);
  const preferredBibleTranslation = useQuestOS(
    (state) => state.settings.preferredBibleTranslation,
  );

  // Open the testament the reader is currently in; default to New Testament.
  const readingTestament = useMemo(() => {
    if (!readingPosition) return "new";
    return oldTestament.some((b) => b.slug === readingPosition.bookSlug)
      ? "old"
      : "new";
  }, [readingPosition]);

  return (
    <>
      <PageHeader title="Bible" subtitle="Read slowly. Let one verse land." />
      <PageContainer>
        {readingPosition && (
          <Link
            href={`/app/bible/${readingPosition.bookSlug}/${readingPosition.chapter}`}
            className="block"
          >
            <PaperCard interactive padding="sm" className="mb-4 flex items-center gap-3.5">
              <span className="rounded-[10px] bg-linen p-2 ring-1 ring-mist">
                <PixelIcon name="bookmark" size={5} />
              </span>
              <div className="flex-1">
                <p className="text-[0.75rem] uppercase tracking-wide text-accent">
                  Continue reading
                </p>
                <p className="text-[1.0625rem] text-graphite">
                  {readingPosition.bookName} {readingPosition.chapter}
                </p>
              </div>
              <IconChevronRight className="text-fog" />
            </PaperCard>
          </Link>
        )}

        <VerseCard verse={verse} />

        {bookmarks.length > 0 && (
          <Link href="/app/bible/saved" className="mt-4 block">
            <PaperCard interactive padding="sm" className="flex items-center gap-3.5">
              <span className="rounded-[10px] bg-linen p-2 ring-1 ring-mist">
                <PixelIcon name="star" size={5} />
              </span>
              <div className="flex-1">
                <p className="text-[1rem] text-graphite">Saved verses</p>
                <p className="text-[0.8125rem] text-ash">
                  {bookmarks.length} saved
                </p>
              </div>
              <IconChevronRight className="text-fog" />
            </PaperCard>
          </Link>
        )}

        <DisclosureGroup className="mt-7">
          <BookList
            title="New Testament"
            books={newTestament}
            defaultOpen={readingTestament === "new"}
          />
          <BookList
            title="Old Testament"
            books={oldTestament}
            defaultOpen={readingTestament === "old"}
          />
        </DisclosureGroup>

        <p className="mt-6 pb-4 text-center text-[0.75rem] text-ash">
          {preferredBibleTranslation === "web"
            ? "World English Bible · Public Domain"
            : `${translationPreferenceLabel(preferredBibleTranslation)} preferred · WEB offline fallback`}
        </p>
      </PageContainer>
    </>
  );
}

function BookList({
  title,
  books,
  defaultOpen,
}: {
  title: string;
  books: BibleBookMeta[];
  defaultOpen?: boolean;
}) {
  return (
    <Disclosure
      defaultOpen={defaultOpen}
      count={books.length}
      label={
        <span className="text-[0.75rem] uppercase tracking-[0.16em] text-accent">
          {title}
        </span>
      }
    >
      <PaperCard variant="paper" padding="none" className="overflow-hidden">
        <ul className="divide-y divide-mist/70">
          {books.map((b) => (
            <li key={b.slug}>
              <Link
                href={`/app/bible/${b.slug}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-linen"
              >
                <span className="text-[1rem] text-charcoal">{b.name}</span>
                <span className="text-[0.8125rem] text-ash">
                  {b.chapterCount} {b.chapterCount === 1 ? "chapter" : "chapters"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PaperCard>
    </Disclosure>
  );
}

export function BibleIndex() {
  return (
    <ClientOnly>
      <BibleIndexInner />
    </ClientOnly>
  );
}
