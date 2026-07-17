"use client";

/**
 * The daily landing screen. It composes the local-first QuestOS state into one
 * calm sequence: welcome and candle, verse, today's quest choices, growth,
 * active walks, and private next steps. Day-bound content refreshes in place
 * when a long-lived tab crosses local midnight.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  useQuestOS,
  selectStreak,
  selectVerseRefreshCount,
  MAX_DAILY_PICKS,
} from "@/lib/questos/store";
import { calculateTreeState, stageProgress } from "@/lib/questos/growth-engine";
import {
  activeQuestAssignments,
  formatQuestWindowRemaining,
  nextQuestSlotAt,
  occupiedQuestAssignments,
  questSlotsRemaining,
  selectSuggestedQuests,
} from "@/lib/questos/quest-engine";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { getBookMeta } from "@/lib/bible";
import { timeOfDay, toDateKey } from "@/lib/utils/dates";
import { cleanVerseText } from "@/lib/utils/scripture";
import { useStrings, fmt } from "@/lib/i18n";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { celebrationScale } from "@/lib/motion";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { VerseCard } from "@/components/bible/VerseCard";
import {
  CATEGORY_LABEL,
  formatDuration,
  QuestSlip,
} from "@/components/quests/QuestSlip";
import { QuestFeed } from "@/components/quests/QuestFeed";
import { AccountPrompt } from "@/components/account/AccountPrompt";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { CATEGORY_SPRITE, PixelIcon } from "@/components/design-system/PixelIcon";
import { Avatar } from "@/components/profile/Avatar";
import { StreakCard } from "@/components/home/StreakCard";
import {
  IconArrowRight,
  IconChevronRight,
  IconSettings,
} from "@/components/design-system/icons";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { seedQuests, questBySlug } from "@/data/seed/quests";
import { usePlus } from "@/lib/revenuecat/usePlus";

function HomeInner() {
  const profile = useQuestOS((s) => s.profile);
  const settings = useQuestOS((s) => s.settings);
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const readingPosition = useQuestOS((s) => s.readingPosition);
  const recentVerses = useQuestOS((s) => s.recentVerses);
  const recordRecentVerse = useQuestOS((s) => s.recordRecentVerse);
  const completions = useQuestOS((s) => s.completions);
  const assignments = useQuestOS((s) => s.assignments);
  const { isPlus } = usePlus();
  // The candle. Stable ref — the stored object itself.
  const streak = useQuestOS(selectStreak);
  // Today's "Another verse" count (primitive) + the action that grows it.
  const verseRefreshCount = useQuestOS(selectVerseRefreshCount);
  const refreshVerse = useQuestOS((s) => s.refreshVerse);
  // Keep day-scoped content fresh when the local day rolls over while the app
  // is left open (or the tab regains focus) — otherwise the verse and date
  // silently show "yesterday".
  const [dayKey, setDayKey] = useState(() => toDateKey());
  const [now, setNow] = useState(() => Date.now());
  const recordedVerseRef = useRef<string | null>(null);

  // Watch for a local day rollover: re-check on an interval, on focus, and on
  // visibility change. setDayKey is a no-op when the day hasn't changed.
  useEffect(() => {
    function check() {
      setNow(Date.now());
      const k = toDateKey();
      setDayKey((prev) => (prev === k ? prev : k));
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const interval = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.clearInterval(interval);
    };
  }, []);

  const tree = useMemo(() => calculateTreeState(growthEvents), [growthEvents]);
  const progress = useMemo(() => stageProgress(tree), [tree]);
  const verse = useMemo(
    () => getDailyVerse(dayKey, verseRefreshCount),
    [dayKey, verseRefreshCount]
  );
  const verseBookName = useMemo(
    () =>
      getBookMeta(verse.bookSlug)?.name ??
      verse.reference.replace(/\s+\d+:.*$/, ""),
    [verse.bookSlug, verse.reference]
  );

  // Home is a real verse view, so keep it in the same persistent history as
  // chapter-reader visits. The ref prevents the store write from retriggering
  // on the recent-verses render it causes; the store remains the authority for
  // cross-session dedupe and the 20-entry cap.
  useEffect(() => {
    const passageKey = `${verse.bookSlug}:${verse.chapter}:${verse.verseStart}-${verse.verseEnd}`;
    if (recordedVerseRef.current === passageKey) return;
    recordedVerseRef.current = passageKey;
    recordRecentVerse({
      bookSlug: verse.bookSlug,
      bookName: verseBookName,
      chapter: verse.chapter,
      verseStart: verse.verseStart,
      verseEnd: verse.verseEnd,
      reference: verse.reference,
      text: verse.text,
    });
  }, [recordRecentVerse, verse, verseBookName]);
  const season = useMemo(() => getCurrentSeason(), []);
  const name = profile?.displayName?.trim();
  const time = timeOfDay();
  const t = useStrings();
  const hello = t.greeting[time];

  // Quest windows are rolling rather than calendar-day based. Derive them
  // from the full reservation record so hidden free-member reservations still
  // count, and refresh the projection once a minute without a store write.
  const picks = useMemo(
    () => activeQuestAssignments(assignments, now),
    [assignments, now]
  );
  const occupiedPicks = useMemo(
    () => occupiedQuestAssignments(assignments, now),
    [assignments, now]
  );
  const slotsRemaining = questSlotsRemaining(assignments, isPlus, now);
  const nextSlot = nextQuestSlotAt(assignments, isPlus, now);

  // Resolve picks to their quest templates (drop any unknown slugs safely).
  const pickedQuests = useMemo(
    () =>
      picks.flatMap((pick) => {
        const quest = questBySlug.get(pick.questSlug);
        return quest ? [{ pick, quest }] : [];
      }),
    [picks]
  );
  const pickCount = pickedQuests.length;
  const completedCount = pickedQuests.filter(
    ({ pick }) => pick.status === "completed"
  ).length;
  const activePickedQuests = pickedQuests.filter(
    ({ pick }) => pick.status === "started"
  );
  const readyPickedQuests = pickedQuests.filter(
    ({ pick }) => pick.status === "assigned"
  );
  const completedPickedQuests = pickedQuests.filter(
    ({ pick }) => pick.status === "completed"
  );
  const questGroups = [
    {
      key: "active",
      label: "Active quests",
      items: activePickedQuests,
    },
    {
      key: "ready",
      label: "Ready to begin",
      items: readyPickedQuests,
    },
    {
      key: "done",
      label: "Completed",
      items: completedPickedQuests,
    },
  ].filter((group) => group.items.length > 0);
  const allDone = pickCount >= 1 && completedCount === pickCount;
  const useCompactQuestRail = pickCount > MAX_DAILY_PICKS;
  const hiddenReservationCount = Math.max(
    0,
    occupiedPicks.length - pickCount
  );
  const canAddQuest = isPlus || slotsRemaining > 0;

  // Suggested quests for the open day — the same deterministic shelf as the
  // browse page, so home and browse always agree on today's offer.
  const suggested = useMemo(() => {
    if (pickCount > 0) return [];
    return selectSuggestedQuests({
      quests: seedQuests,
      dateKey: dayKey,
      profile,
      settings,
      season: season.key,
      recentSlugs: completions.map((c) => c.questSlug),
      excludeSlugs: completions
        .filter((c) => c.dateKey === dayKey)
        .map((c) => c.questSlug),
      count: 3,
    });
  }, [pickCount, dayKey, profile, settings, season.key, completions]);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
        <SeasonalAtmosphere density={7} />
      </div>

      <PageContainer className="relative pt-safe">
        {/* Personal welcome — one framed devotional surface with today's
            candle, echoing a bookplate rather than a dashboard header. */}
        <header className="sacred-frame mt-7 mb-5 bg-paper/90 px-5 py-5 max-[360px]:px-4 sm:px-6">
          <div className="relative z-10 flex min-w-0 items-center gap-3 max-[360px]:gap-2.5 min-[361px]:gap-3.5">
            <Link
              href="/app/settings"
              aria-label={t.home.openSettings}
              className="relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Avatar
                name={profile?.displayName}
                marker={profile?.avatarUpdatedAt}
                size="sm"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[1rem] leading-tight text-accent">
                {name ? `${hello},` : season.label}
              </p>
              <h1 className="mt-1 truncate font-display text-[1.5rem] leading-tight text-graphite sm:text-editorial">
                {name || `${hello}.`}
              </h1>
              {name && (
                <p className="mt-1 text-[0.8125rem] uppercase tracking-[0.14em] text-ash">
                  {season.label}
                </p>
              )}
            </div>
            <StreakCard streak={streak} dayKey={dayKey} />
          </div>
          <Link
            href="/app/settings"
            className="relative z-10 mt-4 flex min-h-11 items-center gap-2.5 rounded-[10px] bg-linen/80 px-3 text-small font-medium text-charcoal ring-1 ring-mist transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconSettings size={18} className="shrink-0 text-accent" />
            <span>Settings</span>
            <span className="ml-1 truncate text-caption font-normal text-ash max-[390px]:hidden">
              Profile, preferences &amp; accessibility
            </span>
            <IconChevronRight className="ml-auto shrink-0 text-fog" />
          </Link>
        </header>

        <div className="space-y-4 pb-4">
          {/* Today's verse */}
          <VerseCard verse={verse} onAnotherVerse={refreshVerse} />

          {/* Today's quests — empty, picked (1-3), or day complete */}
          <section
            id="active-quests"
            aria-label={t.home.todaysQuests}
            tabIndex={-1}
            className="scroll-mt-6 outline-none"
          >
            {/* The loudest title on the page — the day's work anchors it. */}
            <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
              <h2 className="font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent min-[380px]:text-[1.75rem]">
                {t.home.todaysQuests}
              </h2>
              {pickCount === 0 ? (
                hiddenReservationCount > 0 ? (
                  <p className="text-caption text-ash">
                    {occupiedPicks.length}/{MAX_DAILY_PICKS} slots reserved
                  </p>
                ) : (
                  <PixelIcon name="scroll" size={5} />
                )
              ) : (
                <p className="text-caption text-ash">
                  {activePickedQuests.length > 0
                    ? `${activePickedQuests.length} active${
                        readyPickedQuests.length > 0
                          ? ` · ${readyPickedQuests.length} ready`
                          : ""
                      }${completedCount > 0 ? ` · ${completedCount} done` : ""}`
                    : completedCount > 0
                      ? `${completedCount}/${pickCount} done`
                      : `${readyPickedQuests.length} ready`}
                </p>
              )}
            </div>

            {/* Announce pick/completion changes to screen readers. */}
            <p aria-live="polite" className="sr-only">
              {pickCount === 0
                ? t.quests.emptyTitle
                : allDone
                  ? canAddQuest
                    ? "Your open quests are complete."
                    : t.dayComplete.title
                  : `${t.quests.completedToday}: ${completedCount}/${pickCount}`}
            </p>

            {pickCount === 0 && (
              <>
                <p className="mb-3 px-1 text-small text-ash">
                  {hiddenReservationCount > 0 && nextSlot
                    ? `Your hidden quest ${hiddenReservationCount === 1 ? "slot" : "slots"} stays reserved until its 24-hour window ends. Your next slot opens in ${formatQuestWindowRemaining(nextSlot, now).replace(" left", "")}.`
                    : t.quests.emptyBody}
                </p>
                {suggested.length > 0 && (
                  <PaperCard variant="linen" padding="sm" className="overflow-hidden !p-2">
                    <ul className="divide-y divide-mist/75">
                    {suggested.slice(0, 2).map((quest) => (
                      <li key={quest.slug}>
                        <QuestSuggestionRow quest={quest} />
                      </li>
                    ))}
                    </ul>
                  </PaperCard>
                )}
                <div className="mt-4 flex justify-center">
                  <GentleLink variant="primary" href="/app/quests">
                    {canAddQuest ? t.quests.pickCta : "Browse and save quests"}{" "}
                    <IconArrowRight />
                  </GentleLink>
                </div>
              </>
            )}

            {pickCount > 0 && (
              <>
                <p className="mb-2.5 px-1 text-caption text-ash">
                  Each quest stays open for 24 hours. Countdown times appear on every quest.
                </p>
                <div className="space-y-4">
                  {questGroups.map((group) => (
                    <div key={group.key}>
                      <h3 className="mb-2 px-1 text-caption uppercase tracking-[0.16em] text-ash">
                        {group.label}
                      </h3>
                      <ul
                        aria-label={group.label}
                        className={
                          useCompactQuestRail
                            ? "-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-8 sm:px-8"
                            : "space-y-3"
                        }
                      >
                        {group.items.map(({ pick, quest }) => (
                          <li
                            key={`${pick.pickedAt}:${quest.slug}`}
                            className={
                              useCompactQuestRail
                                ? "w-[min(84vw,20rem)] shrink-0 snap-start"
                                : undefined
                            }
                          >
                            <QuestSlip
                              quest={quest}
                              href={`/app/quests/${quest.slug}`}
                              assignmentStatus={pick.status}
                              completed={pick.status === "completed"}
                              expiresAt={pick.expiresAt}
                              compact={useCompactQuestRail}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                {useCompactQuestRail && (
                  <p className="mt-1 px-1 text-caption text-ash">
                    Swipe sideways to review every open quest.
                  </p>
                )}
                {canAddQuest && (
                  <div className="mt-2.5">
                    <GentleLink variant="text" size="sm" href="/app/quests">
                      {t.quests.addAnother} <IconArrowRight size={14} />
                    </GentleLink>
                  </div>
                )}
              </>
            )}

            {allDone && (
              <motion.div
                variants={celebrationScale}
                initial="hidden"
                animate="visible"
              >
                <PaperCard
                  variant="paper"
                  padding="lg"
                  className="pixel-frame-gold text-center"
                >
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/15">
                    <PixelIcon name="star" size={5} animate />
                  </div>
                  <h3 className="font-display text-editorial text-graphite">
                    {canAddQuest
                      ? "Your open quests are complete."
                      : t.dayComplete.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-small leading-relaxed text-charcoal">
                    {canAddQuest
                      ? "Take the win. There’s room for another quest if it would serve your day."
                      : t.dayComplete.body}
                  </p>
                  <div className="mt-4 flex justify-center gap-3">
                    <GentleLink variant="outline" size="sm" href="/app/bible">
                      Read Scripture
                    </GentleLink>
                    <GentleLink variant="ghost" size="sm" href="/app/prayer/new">
                      Write a prayer
                    </GentleLink>
                  </div>
                </PaperCard>
              </motion.div>
            )}
          </section>

          {/* Growth preview — the journey, one glance */}
          <Link href="/app/journey" className="block">
            <PaperCard interactive variant="linen" padding="md" className="flex items-center gap-3 min-[380px]:gap-4">
              <GrowthTree state={tree} size={76} showGround={false} />
              <div className="min-w-0 flex-1">
                <SectionLabel pixel>{t.home.yourGrowth}</SectionLabel>
                <p className="font-display text-subheading text-graphite">
                  {tree.stageLabel}
                </p>
                {/* Gentle progression bar — the caption carries the meaning. */}
                <div
                  aria-hidden="true"
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist/60"
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(progress?.fraction ?? 1) * 100}%` }}
                  />
                </div>
                <p className="mt-1.5 text-caption text-ash">
                  {tree.toNextStage != null
                    ? tree.toNextStage === 1
                      ? t.journey.toNextOne
                      : fmt(t.journey.toNext, { n: tree.toNextStage })
                    : t.journey.fullGrown}
                </p>
              </div>
              <IconChevronRight className="shrink-0 text-fog max-[350px]:hidden" />
            </PaperCard>
          </Link>

          {/* Your quests — the shelf: active walks beyond today, saved for
              later, and the completed record. Renders nothing when the
              shelf holds nothing beyond today's picks. */}
          <QuestFeed picks={picks} />

          {/* A gentle, once-per-context invitation to keep the journey
              safe across devices. Never a modal; easy to wave off. */}
          <AccountPrompt />

          {/* Snippet rows — prayer, reading, reflection. Each card names
              itself; no extra label chrome (the phone gives us enough). */}
          <div className="space-y-3 pt-1">
            <QuickRow
              href="/app/prayer/new"
              sprite="candle"
              title="One minute of prayer"
              subtitle="Say what’s on your mind. It stays private."
            />
            <QuickRow
              href={
                readingPosition
                  ? `/app/bible/${readingPosition.bookSlug}/${readingPosition.chapter}`
                  : "/app/bible"
              }
              sprite="book"
              title={
                readingPosition
                  ? `Continue ${readingPosition.bookName} ${readingPosition.chapter}`
                  : "Open the Bible"
              }
              subtitle={
                readingPosition
                  ? "Pick up where you left off."
                  : "Pick a book and start reading."
              }
            />
            <QuickRow
              href="/app/reflection"
              sprite="sun"
              title={t.titles.reflections}
              subtitle={t.home.reflectionHint}
            />
          </div>

          {/* Recent Scripture history — persistent, deduplicated, and linked
              back to the exact range in its chapter. */}
          {recentVerses.length > 0 && (
            <section aria-label="Recent Verses" className="pt-1">
              <SectionLabel pixel>{t.home.recently}</SectionLabel>
              <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-8 sm:px-8">
                {recentVerses.slice(0, 8).map((recentVerse) => {
                  const verseSegment =
                    recentVerse.verseEnd > recentVerse.verseStart
                      ? `${recentVerse.verseStart}-${recentVerse.verseEnd}`
                      : `${recentVerse.verseStart}`;
                  const href = `/app/bible/${recentVerse.bookSlug}/${recentVerse.chapter}?verse=${verseSegment}#verse-${recentVerse.verseStart}`;
                  return (
                    <li
                      key={`${recentVerse.bookSlug}:${recentVerse.chapter}:${verseSegment}`}
                      className="w-[min(78vw,18rem)] shrink-0 snap-start"
                    >
                      <Link
                        href={href}
                        aria-label={`Open ${recentVerse.reference} in the Bible`}
                        className="block h-full rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <PaperCard
                          interactive
                          variant="quiet"
                          padding="sm"
                          className="flex h-full min-h-28 flex-col"
                        >
                          <div className="flex items-center gap-2">
                            <PixelIcon name="book" size={4} />
                            <p className="font-display text-[1.0625rem] text-graphite">
                              {recentVerse.reference}
                            </p>
                            <IconChevronRight className="ml-auto shrink-0 text-fog" />
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
        </div>
      </PageContainer>
    </div>
  );
}

function SectionLabel({
  children,
  pixel,
}: {
  children: React.ReactNode;
  /** Ithaca header voice — larger, and a real heading over its content. */
  pixel?: boolean;
}) {
  if (pixel) {
    return (
      <h2 className="mb-2.5 font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent">
        {children}
      </h2>
    );
  }
  return (
    <p className="mb-2 text-caption uppercase tracking-[0.16em] text-accent">
      {children}
    </p>
  );
}

function QuickRow({
  href,
  sprite,
  title,
  subtitle,
}: {
  href: string;
  sprite: Parameters<typeof PixelIcon>[0]["name"];
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="block">
      <PaperCard interactive padding="sm" className="flex items-center gap-3.5">
        <span className="rounded-[10px] bg-linen p-2 ring-1 ring-mist">
          <PixelIcon name={sprite} size={5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body text-graphite">{title}</p>
          <p className="text-caption text-ash">{subtitle}</p>
        </div>
        <IconChevronRight className="text-fog" />
      </PaperCard>
    </Link>
  );
}

function QuestSuggestionRow({ quest }: { quest: (typeof seedQuests)[number] }) {
  return (
    <Link
      href={`/app/quests/${quest.slug}`}
      className="group flex min-h-[4.5rem] items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors duration-300 hover:bg-paper"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-paper ring-1 ring-mist">
        <PixelIcon name={CATEGORY_SPRITE[quest.category] ?? "leaf"} size={5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 font-display text-[1.0625rem] leading-snug text-graphite">
          {quest.title}
        </span>
        <span className="mt-0.5 block text-[0.75rem] text-ash">
          {formatDuration(quest.durationMinutes)} · {CATEGORY_LABEL[quest.category]}
        </span>
      </span>
      <IconChevronRight className="shrink-0 text-fog transition-transform duration-300 group-hover:translate-x-0.5" />
    </Link>
  );
}

export function HomeScreen() {
  return (
    <ClientOnly>
      <HomeInner />
    </ClientOnly>
  );
}
