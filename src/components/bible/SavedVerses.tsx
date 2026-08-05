"use client";

import Link from "next/link";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { IconArrowLeft, IconBookmarkFilled } from "@/components/design-system/icons";
import { emptyStates } from "@/lib/questos/copy";
import { cleanVerseText } from "@/lib/utils/scripture";
import type { VerseBookmark } from "@/lib/questos/types";
import { usePreferredBiblePassage } from "@/lib/bible/use-preferred-scripture";
import { ApiBibleViewTracker } from "@/components/bible/ApiBibleViewTracker";
import { LOCAL_WEB_TRANSLATION_KEY } from "@/lib/bible/translations";
import { chapterHref } from "@/lib/bible/links";

function SavedVerseCard({
  bookmark,
  onToggle,
}: {
  bookmark: VerseBookmark;
  onToggle: (bookmark: VerseBookmark) => void;
}) {
  const savedTranslationKey = bookmark.translationKey ?? "web";
  const resolved = usePreferredBiblePassage(
    {
      id: `saved:${bookmark.id}`,
      bookSlug: bookmark.bookSlug,
      chapter: bookmark.chapter,
      verseStart: bookmark.verse,
      verseEnd: bookmark.verse,
      reference: `${bookmark.bookName} ${bookmark.chapter}:${bookmark.verse}`,
      text: bookmark.text,
      theme: "saved",
    },
    true,
    savedTranslationKey,
    savedTranslationKey,
  );
  const href = chapterHref(bookmark.bookSlug, bookmark.chapter, {
    translation: savedTranslationKey,
    verse: bookmark.verse,
    anchor: bookmark.verse,
  });

  return (
    <PaperCard variant="paper" padding="md">
      <Link
        href={href}
        aria-busy={resolved.loading}
        className="block"
      >
        <blockquote
          className="verse-text"
          dir={resolved.effectiveTranslation.direction}
          lang={resolved.effectiveTranslation.languageId}
        >
          “{cleanVerseText(resolved.text)}”
        </blockquote>
        <cite className="mt-2 block text-[0.875rem] not-italic text-accent">
          {bookmark.bookName} {bookmark.chapter}:{bookmark.verse}{" "}
          <span className="text-fog">·</span>{" "}
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-ash"
          >
            {resolved.loading
              ? `${resolved.effectiveTranslation.abbreviation} · checking ${resolved.preferredTranslation?.source === "helloao" ? "open source" : "saved edition"}…`
              : resolved.effectiveTranslation.abbreviation}
          </span>
        </cite>
        {!resolved.loading && resolved.fallbackReason && (
          <p className="mt-1 text-caption leading-relaxed text-ash">
            {resolved.usingStoredSnapshot
              ? `Your saved ${resolved.effectiveTranslation.abbreviation} copy is shown because its open online source could not refresh.`
              : `${resolved.preferredTranslation?.abbreviation ?? "The saved edition"} preferred · ${resolved.effectiveTranslation.abbreviation} shown because ${
                  resolved.preferredTranslation?.source === "helloao"
                    ? "the open online edition could not be loaded."
                    : resolved.fallbackReason === "content_unavailable"
                      ? "the preferred text could not be loaded."
                      : "its licensed connection is unavailable."
                }`}
          </p>
        )}
        {!resolved.loading &&
          resolved.effectiveTranslation.copyright &&
          resolved.effectiveTranslation.key !== LOCAL_WEB_TRANSLATION_KEY && (
            <p
              className="mt-2 text-caption leading-relaxed text-ash"
              dir={resolved.effectiveTranslation.direction}
              lang={resolved.effectiveTranslation.languageId}
            >
              {resolved.effectiveTranslation.copyright}
            </p>
          )}
      </Link>
      {!resolved.loading && resolved.effectiveTranslation.licenseUrl && (
        <a
          href={resolved.effectiveTranslation.licenseUrl}
          target="_blank"
          rel="noreferrer"
          dir="ltr"
          lang="en"
          className="mt-1 inline-flex min-h-11 items-center text-[0.8125rem] text-ash underline decoration-fog underline-offset-2 transition-colors hover:text-charcoal"
        >
          Open source &amp; license
        </a>
      )}
      <ApiBibleViewTracker token={resolved.fumsToken} />
      <button
        type="button"
        aria-label={`Remove ${bookmark.bookName} ${bookmark.chapter}:${bookmark.verse} from saved verses`}
        onClick={() => onToggle(bookmark)}
        className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-[0.8125rem] text-ash transition-colors hover:text-charcoal"
      >
        <IconBookmarkFilled size={15} className="text-accent" /> Remove saved verse
      </button>
    </PaperCard>
  );
}

function SavedVersesInner() {
  const { toast } = useToast();
  const bookmarks = useQuestOS((s) => s.bookmarks);
  const toggleBookmark = useQuestOS((s) => s.toggleBookmark);

  const sorted = [...bookmarks].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <PageContainer className="pt-safe">
      <div className="pt-6">
        <Link
          href="/app/bible"
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> Bible
        </Link>
      </div>

      <h1 className="mt-5 font-display text-editorial text-graphite">Saved verses</h1>

      {sorted.length === 0 ? (
        <PaperCard variant="quiet" padding="lg" className="mt-6 text-center">
          <p className="text-[0.9375rem] text-ash">{emptyStates.bookmarks}</p>
          <GentleLink variant="text" href="/app/bible" className="mt-2">
            Open the Bible
          </GentleLink>
        </PaperCard>
      ) : (
        <div className="mt-6 space-y-3 pb-8">
          {sorted.map((bookmark) => (
            <SavedVerseCard
              key={bookmark.id}
              bookmark={bookmark}
              onToggle={(entry) => {
                toggleBookmark(entry);
                toast("Removed.", {
                  action: {
                    label: "Undo",
                    onClick: () => toggleBookmark(entry),
                  },
                });
              }}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

export function SavedVerses() {
  return (
    <ClientOnly>
      <SavedVersesInner />
    </ClientOnly>
  );
}
