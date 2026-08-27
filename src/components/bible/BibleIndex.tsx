"use client";

/**
 * The Bible landing page is a reading hub rather than a static index. It keeps
 * the daily verse, reviewed life topics, reading history, saved Scripture, and
 * all 66 books close without allowing navigation controls to compete with the
 * text itself.
 */
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  selectVerseRefreshCount,
  useQuestOS,
} from "@/lib/questos/store";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import {
  bibleBooks,
  getBookMeta,
  newTestament,
  oldTestament,
} from "@/lib/bible/index";
import { chapterHref } from "@/lib/bible/links";
import {
  SCRIPTURE_TOPICS,
  searchScriptureTopics,
  topicPassageHref,
} from "@/lib/bible/topics";
import { cleanVerseText } from "@/lib/utils/scripture";
import { useCurrentDayKey } from "@/lib/use-current-day-key";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { VerseCard } from "@/components/bible/VerseCard";
import { VerseRefreshLimitDialog } from "@/components/bible/VerseRefreshLimitDialog";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { SearchClearButton } from "@/components/design-system/SearchClearButton";
import {
  IconBookmark,
  IconChevronRight,
  IconSearch,
  IconSettings,
} from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";
import {
  translationMetadata,
  translationPreferenceLabel,
} from "@/lib/bible/translations";
import { usePlus } from "@/lib/billing/usePlus";
import { useSession } from "@/lib/supabase/useSession";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import { TodayFormation } from "@/components/home/TodayFormation";

type Testament = "new" | "old";

function BibleIndexInner() {
  const plus = usePlus();
  const { user } = useSession();
  const shouldReduceMotion = useShouldReduceMotion();
  const profileCreatedAt = useQuestOS((state) => state.profile?.createdAt);
  const readingPosition = useQuestOS((state) => state.readingPosition);
  const bookmarks = useQuestOS((state) => state.bookmarks);
  const chaptersRead = useQuestOS((state) => state.chaptersRead);
  const recentVerses = useQuestOS((state) => state.recentVerses);
  const recordRecentVerse = useQuestOS((state) => state.recordRecentVerse);
  const preferredBibleTranslation = useQuestOS(
    (state) => state.settings.preferredBibleTranslation,
  );
  const verseRefreshCount = useQuestOS(selectVerseRefreshCount);
  const refreshVerse = useQuestOS((state) => state.refreshVerse);
  const dayKey = useCurrentDayKey();
  const [bookQuery, setBookQuery] = useState("");
  const [refreshLimitOpen, setRefreshLimitOpen] = useState(false);
  const [testament, setTestament] = useState<Testament>(() =>
    readingPosition &&
    oldTestament.some((book) => book.slug === readingPosition.bookSlug)
      ? "old"
      : "new",
  );

  // Prefer the account id so the same person keeps one verse across devices;
  // local-only profiles still receive their own stable daily selection.
  const verseAudienceKey = user?.id ?? profileCreatedAt;
  const verse = useMemo(
    () => getDailyVerse(dayKey, verseRefreshCount, verseAudienceKey),
    [dayKey, verseAudienceKey, verseRefreshCount],
  );
  const verseBookName = useMemo(
    () =>
      getBookMeta(verse.bookSlug)?.name ??
      verse.reference.replace(/\s+\d+:.*$/, ""),
    [verse.bookSlug, verse.reference],
  );
  const preferredEdition = translationMetadata(preferredBibleTranslation);

  // Let the store make the final allowance decision so rapid clicks cannot
  // spend a fourth refresh; only a denied free attempt reveals the Plus hint.
  function handleAnotherVerse() {
    if (plus.loading) return;
    const refreshed = refreshVerse(plus.isPlus);
    if (!refreshed && !plus.isPlus) setRefreshLimitOpen(true);
  }

  // Keep the dialog close callback stable while its focus trap is active.
  const closeRefreshLimitDialog = useCallback(
    () => setRefreshLimitOpen(false),
    [],
  );

  // VerseCard resolves the preferred edition first, then sends back only text
  // that BibleQuest may safely keep in recent-reading history.
  const recordPresentedVerse = useCallback(
    (text: string) => {
      recordRecentVerse({
        bookSlug: verse.bookSlug,
        bookName: verseBookName,
        chapter: verse.chapter,
        verseStart: verse.verseStart,
        verseEnd: verse.verseEnd,
        reference: verse.reference,
        text,
      });
    },
    [recordRecentVerse, verse, verseBookName],
  );

  const normalizedBookQuery = bookQuery.trim().toLocaleLowerCase();
  const visibleBooks = useMemo(() => {
    if (normalizedBookQuery) {
      return bibleBooks.filter((book) =>
        book.name.toLocaleLowerCase().includes(normalizedBookQuery),
      );
    }
    return testament === "new" ? newTestament : oldTestament;
  }, [normalizedBookQuery, testament]);

  const readCountByBook = useMemo(() => {
    const counts = new Map<string, number>();
    for (const chapter of chaptersRead) {
      counts.set(chapter.bookSlug, (counts.get(chapter.bookSlug) ?? 0) + 1);
    }
    return counts;
  }, [chaptersRead]);

  const previousVerses = recentVerses
    .filter(
      (recent) =>
        !(
          recent.bookSlug === verse.bookSlug &&
          recent.chapter === verse.chapter &&
          recent.verseStart === verse.verseStart &&
          recent.verseEnd === verse.verseEnd
        ),
    )
    .slice(0, 8);

  const editionSummary =
    preferredEdition?.source === "local"
      ? "Available offline"
      : preferredEdition?.source === "helloao"
        ? "Open edition · WEB offline fallback"
        : "Preferred edition · open fallback available";

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className={cn(
          "ambient pointer-events-none absolute -right-20 top-10 h-56 w-56 rounded-full bg-gold-300/10 blur-3xl",
          !shouldReduceMotion && "[animation:var(--animate-twinkle)]",
        )}
      />
      <PageHeader title="Bible" subtitle="Read slowly. Let one verse land." />
      <PageContainer className="relative pb-6">
        <section
          id="todays-verse"
          aria-label="Today's verse"
          className="scroll-mt-6"
        >
          <VerseCard
            verse={verse}
            onAnotherVerse={handleAnotherVerse}
            anotherVerseLoading={plus.loading}
            showOpenInChapter
            onPresentedText={recordPresentedVerse}
          />
        </section>

        <VerseRefreshLimitDialog
          open={refreshLimitOpen}
          onClose={closeRefreshLimitDialog}
        />

        <section
          aria-labelledby="reading-shortcuts"
          className="mt-6"
        >
          <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
            <h2
              id="reading-shortcuts"
              className="font-art-label text-[1.375rem] uppercase tracking-[0.05em] text-accent"
            >
              Your reading
            </h2>
            <p className="text-caption text-ash">
              {chaptersRead.length} {chaptersRead.length === 1 ? "chapter" : "chapters"} read
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <QuickLink
              href={
                readingPosition
                  ? chapterHref(readingPosition.bookSlug, readingPosition.chapter)
                  : chapterHref("john", 1)
              }
              icon={<ArtIcon name="bookmark" size={48} />}
              eyebrow={readingPosition ? "Continue" : "A place to begin"}
              title={
                readingPosition
                  ? `${readingPosition.bookName} ${readingPosition.chapter}`
                  : "John 1"
              }
            />
            <QuickLink
              href="/app/bible/saved"
              icon={<IconBookmark size={34} />}
              eyebrow="Saved verses"
              title={`${bookmarks.length} saved`}
            />
          </div>

          <Link
            href="/app/settings"
            className="mt-3 flex min-h-12 items-center gap-3 rounded-[var(--radius-card)] border border-mist bg-paper/70 px-4 py-2.5 transition-colors hover:border-accent/35 hover:bg-paper"
          >
            <IconSettings size={18} className="text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-small text-graphite">
                {preferredEdition?.name ??
                  translationPreferenceLabel(preferredBibleTranslation)}
              </span>
              <span className="block truncate text-caption text-ash">
                {editionSummary}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-accent-surface px-2.5 py-1 text-caption font-medium text-accent">
              {preferredEdition?.abbreviation ??
                translationPreferenceLabel(preferredBibleTranslation)}
            </span>
          </Link>
        </section>

        {/* The guided reading follows the reader's own place in Scripture: this
            tab's first job is getting back into the text. Games stay on Home. */}
        <div className="mt-6">
          <TodayFormation dayKey={dayKey} show="guide" />
        </div>

        {previousVerses.length > 0 && (
          <section
            aria-labelledby="recent-scripture"
            className="mt-7"
          >
            <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
              <h2
                id="recent-scripture"
                className="font-art-label text-[1.375rem] uppercase tracking-[0.05em] text-accent"
              >
                Recently read
              </h2>
              <span className="text-caption text-ash">Swipe to revisit</span>
            </div>
            <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-8 sm:px-8">
              {previousVerses.map((recentVerse) => {
                const verseSegment =
                  recentVerse.verseEnd > recentVerse.verseStart
                    ? `${recentVerse.verseStart}-${recentVerse.verseEnd}`
                    : `${recentVerse.verseStart}`;
                return (
                  <li
                    key={`${recentVerse.bookSlug}:${recentVerse.chapter}:${verseSegment}`}
                    className="w-[min(76vw,18rem)] shrink-0 snap-start"
                  >
                    <Link
                      href={chapterHref(recentVerse.bookSlug, recentVerse.chapter, {
                        verse: verseSegment,
                        anchor: recentVerse.verseStart,
                      })}
                      aria-label={`Open ${recentVerse.reference}`}
                      className="block h-full rounded-[var(--radius-card)]"
                    >
                      <PaperCard
                        interactive
                        variant="quiet"
                        padding="sm"
                        className="flex h-full min-h-28 flex-col"
                      >
                        <div className="flex items-center gap-2">
                          <ArtIcon name="open-book" size={56} />
                          <p className="font-display text-[1.0625rem] text-graphite">
                            {recentVerse.reference}
                          </p>
                          <IconChevronRight className="ml-auto text-fog" />
                        </div>
                        <p className="mt-2 line-clamp-2 text-caption leading-relaxed text-ash">
                          “{cleanVerseText(recentVerse.text)}”
                        </p>
                      </PaperCard>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Topic discovery stays separate from book lookup so a reader can
            search by a life question without changing testament browsing. */}
        <TopicDiscovery />

        <section
          aria-labelledby="find-a-book"
          className="mt-7"
        >
          <div className="px-1">
            <h2
              id="find-a-book"
              className="font-art-label text-[1.5rem] uppercase tracking-[0.05em] text-accent"
            >
              Find a book
            </h2>
            <p className="mt-1 text-small text-ash">
              Search all 66 books or browse by testament.
            </p>
          </div>

          <div className="relative mt-3">
            <label htmlFor="bible-book-search" className="sr-only">
              Search Bible books
            </label>
            <IconSearch
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ash"
            />
            <input
              id="bible-book-search"
              type="search"
              value={bookQuery}
              onChange={(event) => setBookQuery(event.target.value)}
              placeholder="Search Genesis, John, Psalms…"
              autoComplete="off"
              className="min-h-12 w-full rounded-[var(--radius-card)] border border-mist bg-paper pl-11 pr-12 text-small text-graphite outline-none paper-shadow transition-colors placeholder:text-quill focus:border-accent/50 [&::-webkit-search-cancel-button]:appearance-none"
            />
            <SearchClearButton
              inputId="bible-book-search"
              visible={bookQuery.length > 0}
              onClear={() => setBookQuery("")}
              label="Clear Bible book search"
            />
          </div>

          {!normalizedBookQuery && (
            <div
              role="group"
              aria-label="Choose a testament"
              className="mt-3 grid grid-cols-2 rounded-[var(--radius-button)] border border-mist bg-linen p-1"
            >
              {(
                [
                  ["new", "New Testament", newTestament.length],
                  ["old", "Old Testament", oldTestament.length],
                ] as const
              ).map(([value, label, count]) => {
                const active = testament === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTestament(value)}
                    className={cn(
                      "relative min-h-11 rounded-[7px] px-3 text-small transition-colors",
                      active ? "text-graphite" : "text-ash hover:text-charcoal",
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-[7px] bg-paper paper-shadow"
                      />
                    )}
                    <span className="relative z-10">
                      {label} <span className="text-caption text-ash">{count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <p role="status" aria-live="polite" className="sr-only">
            {visibleBooks.length} {visibleBooks.length === 1 ? "book" : "books"} shown
          </p>

          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {visibleBooks.map((book) => {
                const readCount = readCountByBook.get(book.slug) ?? 0;
                const isCurrent = readingPosition?.bookSlug === book.slug;
                return (
                  <li key={book.slug}>
                    <Link
                      href={`/app/bible/${book.slug}`}
                      className={cn(
                        "group flex min-h-[5.25rem] h-full flex-col justify-between rounded-[var(--radius-card)] border bg-paper p-3.5 paper-shadow transition-colors duration-300 [transition-timing-function:var(--ease-gentle)] hover:border-accent/45 hover:paper-shadow-lg",
                        !shouldReduceMotion && "hover:-translate-y-0.5",
                        isCurrent ? "border-accent/45 bg-accent-surface/40" : "border-mist",
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-display text-[1.0625rem] leading-tight text-graphite">
                          {book.name}
                        </span>
                        {isCurrent && (
                          <>
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 shrink-0 rounded-full bg-accent"
                            />
                            <span className="sr-only">Current reading book</span>
                          </>
                        )}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2 text-caption text-ash">
                        <span>{book.chapterCount} ch.</span>
                        <span>{readCount > 0 ? `${readCount} read` : "Open"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>

          {visibleBooks.length === 0 && (
            <PaperCard variant="quiet" padding="md" className="mt-3 text-center">
              <p className="text-small text-ash">
                No Bible book matches “{bookQuery.trim()}”.
              </p>
              <button
                type="button"
                onClick={() => setBookQuery("")}
                className="mt-2 min-h-11 text-small font-medium text-accent underline-offset-4 hover:underline"
              >
                Clear search
              </button>
            </PaperCard>
          )}
        </section>

        <p className="mt-7 pb-4 text-center text-caption leading-relaxed text-ash">
          {preferredEdition?.source === "local"
            ? "World English Bible · Available offline · Public domain"
            : preferredEdition?.source === "helloao"
              ? `${preferredEdition.abbreviation} preferred · Open online · WEB offline fallback`
              : `${translationPreferenceLabel(preferredBibleTranslation)} preferred · Open edition fallback · WEB offline`}
        </p>
      </PageContainer>
    </div>
  );
}

/** Offers reviewed passages by life topic without loading Bible chapter data. */
function TopicDiscovery() {
  const [topicQuery, setTopicQuery] = useState("");
  const hasTopicQuery = topicQuery.trim().length > 0;
  const topicMatches = useMemo(
    () => searchScriptureTopics(topicQuery),
    [topicQuery],
  );

  return (
    <section
      aria-labelledby="find-scripture-by-topic"
      className="mt-7"
    >
      <div className="px-1">
        <h2
          id="find-scripture-by-topic"
          className="font-art-label text-[1.5rem] uppercase tracking-[0.05em] text-accent"
        >
          Find Scripture by topic
        </h2>
        <p className="mt-1 text-small text-ash">
          Search a curated set of passages for what you&apos;re carrying.
        </p>
      </div>

      <div className="relative mt-3">
        <label htmlFor="bible-topic-search" className="sr-only">
          Search Scripture topics
        </label>
        <IconSearch
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ash"
        />
        <input
          id="bible-topic-search"
          type="search"
          value={topicQuery}
          onChange={(event) => setTopicQuery(event.target.value)}
          placeholder="Try forgiveness, anxiety, grief…"
          autoComplete="off"
          aria-controls="scripture-topic-results"
          className="min-h-12 w-full rounded-[var(--radius-card)] border border-mist bg-paper pl-11 pr-12 text-small text-graphite outline-none paper-shadow transition-colors placeholder:text-quill focus:border-accent/50 [&::-webkit-search-cancel-button]:appearance-none"
        />
        <SearchClearButton
          inputId="bible-topic-search"
          visible={topicQuery.length > 0}
          onClear={() => setTopicQuery("")}
          label="Clear Scripture topic search"
        />
      </div>

      {/* A single horizontal row makes the catalog discoverable without
          turning the reading page into a wall of topic cards. */}
      <div className="mt-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-caption font-medium uppercase tracking-[0.1em] text-accent">
            Browse topics
          </p>
          <p className="text-caption text-ash">Available offline</p>
        </div>
        <ul className="-mx-5 mt-2 flex snap-x gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-8 sm:px-8">
          {SCRIPTURE_TOPICS.map((topic) => {
            const selected = topicQuery === topic.title;
            return (
              <li key={topic.slug} className="shrink-0 snap-start">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTopicQuery(topic.title)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-small transition-colors",
                    selected
                      ? "border-accent/45 bg-accent-surface text-accent"
                      : "border-mist bg-paper text-graphite hover:border-accent/35",
                  )}
                >
                  {topic.title}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div id="scripture-topic-results">
        {hasTopicQuery && (
          <p
            role="status"
            aria-live="polite"
            className="mt-2 px-1 text-caption text-ash"
          >
            {topicMatches.length === 0
              ? "No reviewed topic found"
              : `${topicMatches.length} ${topicMatches.length === 1 ? "topic" : "topics"} found`}
          </p>
        )}

        {hasTopicQuery && topicMatches.length > 0 && (
          <ul className="mt-2 space-y-3">
            {topicMatches.map((topic) => (
              <PaperCard
                key={topic.slug}
                as="li"
                variant="quiet"
                padding="sm"
              >
                <h3 className="font-display text-[1.25rem] text-graphite">
                  {topic.title}
                </h3>
                <p className="mt-1 text-small leading-relaxed text-ash">
                  {topic.summary}
                </p>
                <ul className="mt-3 space-y-2">
                  {topic.passages.map((passage) => (
                    <li key={passage.reference}>
                      <Link
                        href={topicPassageHref(passage)}
                        className="group flex min-h-16 items-center gap-3 rounded-[var(--radius-button)] border border-mist/80 bg-paper/75 px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-paper"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[1.0625rem] text-graphite">
                            {passage.reference}
                          </span>
                          <span className="mt-0.5 block text-caption leading-relaxed text-ash">
                            {passage.context}
                          </span>
                        </span>
                        <IconChevronRight
                          size={18}
                          className="shrink-0 text-fog transition-colors group-hover:text-accent"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </PaperCard>
            ))}
          </ul>
        )}

        {hasTopicQuery && topicMatches.length === 0 && (
          <PaperCard variant="quiet" padding="md" className="mt-2 text-center">
            <p className="text-small text-ash">
              No curated topic matches “{topicQuery.trim()}” yet.
            </p>
            <button
              type="button"
              onClick={() => setTopicQuery("")}
              className="mt-2 min-h-11 text-small font-medium text-accent underline-offset-4 hover:underline"
            >
              Browse all topics
            </button>
          </PaperCard>
        )}
      </div>
    </section>
  );
}

function QuickLink({
  href,
  icon,
  eyebrow,
  title,
}: {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="h-full">
      <Link href={href} className="block h-full rounded-[var(--radius-card)]">
        <PaperCard
          interactive
          padding="sm"
          className="flex h-full min-h-28 flex-col justify-between"
        >
          {/* No plate. A 36px box was squeezing a 56px illustration, and the
              artwork carries its own silhouette — the Save and Share controls above
              already sit bare on the same page. */}
          <span className="flex items-center text-accent">{icon}</span>
          <span className="mt-3">
            <span className="block text-caption uppercase tracking-[0.1em] text-accent">
              {eyebrow}
            </span>
            <span className="mt-0.5 flex items-center gap-1 font-display text-[1.0625rem] leading-tight text-graphite">
              <span className="min-w-0 truncate">{title}</span>
              <IconChevronRight size={16} className="ml-auto text-fog" />
            </span>
          </span>
        </PaperCard>
      </Link>
    </div>
  );
}

export function BibleIndex() {
  return (
    <ClientOnly>
      <BibleIndexInner />
    </ClientOnly>
  );
}
