"use client";

/**
 * The daily landing screen. It composes the local-first QuestOS state into one
 * calm sequence: welcome and candle, today's quest choices, growth, and
 * private next steps. Scripture discovery stays one tap away without competing
 * with the quests that anchor the daily experience.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  useQuestOS,
  selectMyQuests,
  selectStreak,
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
import { timeOfDay, toDateKey } from "@/lib/utils/dates";
import { useStrings, fmt } from "@/lib/i18n";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { riseIn } from "@/lib/motion";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { CATEGORY_LABEL, formatDuration } from "@/components/quests/QuestSlip";
import { AccountPrompt } from "@/components/account/AccountPrompt";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { CATEGORY_SPRITE, PixelIcon } from "@/components/design-system/PixelIcon";
import { Avatar } from "@/components/profile/Avatar";
import { StreakCard } from "@/components/home/StreakCard";
import { HomeQuestCategory } from "@/components/home/HomeQuestCategory";
import { HomeQuestDisclosure } from "@/components/home/HomeQuestDisclosure";
import {
  IconArrowRight,
  IconChevronRight,
  IconSettings,
} from "@/components/design-system/icons";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { seedQuests, questBySlug } from "@/data/seed/quests";
import { usePlus } from "@/lib/revenuecat/usePlus";
import { ExplorePlusLink } from "@/components/plus/ExplorePlusLink";
import { homeQuestSummary } from "@/lib/questos/home-quest-summary";
import { buildHomeQuestGroups } from "@/lib/questos/home-quest-groups";

function HomeInner() {
  const profile = useQuestOS((s) => s.profile);
  const settings = useQuestOS((s) => s.settings);
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const readingPosition = useQuestOS((s) => s.readingPosition);
  const completions = useQuestOS((s) => s.completions);
  const assignments = useQuestOS((s) => s.assignments);
  const myQuests = useQuestOS(selectMyQuests);
  const { isPlus } = usePlus();
  // The candle. Stable ref — the stored object itself.
  const streak = useQuestOS(selectStreak);
  // Keep day-scoped quest suggestions and rolling countdowns fresh when a
  // long-lived tab crosses midnight or returns from the background.
  const [dayKey, setDayKey] = useState(() => toDateKey());
  const [now, setNow] = useState(() => Date.now());

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
  // The long-lived PWA already refreshes dayKey; seasonal content should move
  // with that same local-day boundary instead of requiring an app restart.
  const season = useMemo(
    () => getCurrentSeason(new Date(`${dayKey}T12:00:00`)),
    [dayKey],
  );
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

  // Current rolling picks and the persistent shelf become one deduplicated
  // collection. Current picks win so their 24-hour countdown stays visible.
  const questGroups = useMemo(
    () =>
      buildHomeQuestGroups({
        assignments: picks,
        myQuests,
        questsBySlug: questBySlug,
        now,
      }),
    [picks, myQuests, now],
  );
  const activeCount = questGroups.active.length;
  const readyCount = questGroups.ready.length;
  const completedCount = questGroups.completed.length;
  const questCount = activeCount + readyCount + completedCount;
  const currentPickCount =
    [...questGroups.active, ...questGroups.ready, ...questGroups.completed].filter(
      (item) => item.kind === "assignment",
    ).length;
  const allDone = questCount > 0 && activeCount === 0 && readyCount === 0;
  const hiddenReservationCount = Math.max(
    0,
    occupiedPicks.length - currentPickCount,
  );
  const canAddQuest = isPlus || slotsRemaining > 0;
  const questSummary = homeQuestSummary({
    activeCount,
    readyCount,
    completedCount,
    visibleCount: questCount,
    occupiedCount: occupiedPicks.length,
    hiddenReservationCount,
  });
  const questAnnouncement =
    questCount === 0
      ? hiddenReservationCount > 0
        ? questSummary
        : t.quests.emptyTitle
      : allDone
        ? "All your quests are complete."
        : questSummary;

  // Suggested quests for the open day — the same deterministic shelf as the
  // browse page, so home and browse always agree on today's offer.
  const suggested = useMemo(() => {
    if (currentPickCount > 0) return [];
    return selectSuggestedQuests({
      quests: seedQuests,
      dateKey: dayKey,
      profile,
      settings,
      season: season.key,
      recentSlugs: completions.map((c) => c.questSlug),
      excludeSlugs: [
        ...Object.keys(myQuests),
        ...completions
          .filter((c) => c.dateKey === dayKey)
          .map((c) => c.questSlug),
      ],
      count: 3,
    });
  }, [
    currentPickCount,
    dayKey,
    profile,
    settings,
    season.key,
    completions,
    myQuests,
  ]);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
        <SeasonalAtmosphere density={7} />
      </div>

      <PageContainer className="relative pt-safe">
        {/* Personal welcome — one framed devotional surface with today's
            candle, echoing a bookplate rather than a dashboard header. */}
        <header
          data-paper-variant="paper"
          className="app-glass-surface sacred-frame mt-4 mb-4 bg-paper/90 px-5 py-4 max-[360px]:px-4 sm:mt-5 sm:px-6 sm:py-5"
        >
          <div className="relative z-10 flex min-w-0 items-center gap-3 max-[360px]:gap-2">
            <Link
              href="/app/settings"
              aria-label={t.home.openSettings}
              className="relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Avatar
                name={profile?.displayName}
                marker={profile?.avatarUpdatedAt}
                size="lg"
                className="ring-1 ring-paper/70 shadow-[0_8px_24px_rgb(18_33_27_/_0.14)] max-[360px]:h-[4.5rem] max-[360px]:w-[4.5rem]"
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-paper text-accent ring-1 ring-mist paper-shadow"
              >
                <IconSettings size={14} />
              </span>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[1rem] leading-tight text-accent max-[360px]:text-[0.875rem]">
                {name ? `${hello},` : season.label}
              </p>
              <h1 className="mt-1 truncate font-display text-[1.375rem] leading-tight text-graphite max-[360px]:text-[1.0625rem] min-[430px]:text-[1.5rem] sm:text-editorial">
                {name || `${hello}.`}
              </h1>
              {name && (
                <p className="mt-1 text-[0.8125rem] uppercase tracking-[0.14em] text-ash max-[360px]:text-[0.6875rem] max-[360px]:tracking-[0.08em]">
                  {season.label}
                </p>
              )}
            </div>
            <StreakCard streak={streak} dayKey={dayKey} />
          </div>
        </header>

        <div className="space-y-4 pb-4">
          {/* Scripture stays directly beneath the personal account surface,
              while the compact treatment leaves quests as Home's main work. */}
          <TodaysVerseLink />

          {/* One quest collection replaces the old daily/persistent split.
              Its outer shell starts open; each status remains collapsible. */}
          <HomeQuestDisclosure
            title={t.nav.quests}
            summary={questSummary}
            announcement={questAnnouncement}
            defaultOpen
          >
            {currentPickCount > 0 && (
              <p className="mb-3 px-1 text-caption text-ash">
                Today’s quest windows stay open for 24 hours. Each card keeps
                its own countdown.
              </p>
            )}

            <div className="space-y-3">
              <HomeQuestCategory
                label={t.quests.groupActive}
                items={questGroups.active}
                defaultOpen={questGroups.active.length > 0}
                emptyBody="No quest is underway right now."
              />
              <HomeQuestCategory
                label={t.quests.groupReady}
                items={questGroups.ready}
                defaultOpen={
                  questGroups.active.length === 0 &&
                  (questGroups.ready.length > 0 || questCount === 0)
                }
                emptyBody={
                  suggested.length > 0
                    ? "A few gentle places to begin."
                    : "No quest is waiting to begin."
                }
              >
                {hiddenReservationCount > 0 && (
                  <p className="px-1 text-caption leading-relaxed text-ash">
                    {hiddenReservationCount} hidden{" "}
                    {hiddenReservationCount === 1 ? "slot stays" : "slots stay"}{" "}
                    reserved until its{" "}
                    {hiddenReservationCount === 1 ? "window ends" : "windows end"}
                    {nextSlot
                      ? `. Your next slot opens in ${formatQuestWindowRemaining(
                          nextSlot,
                          now,
                        ).replace(" left", "")}.`
                      : "."}
                  </p>
                )}
                {suggested.length > 0 && (
                  <PaperCard
                    variant="paper"
                    padding="sm"
                    className="overflow-hidden !p-2"
                  >
                    <ul
                      aria-label="Suggested quests"
                      className="divide-y divide-mist/75"
                    >
                      {suggested.slice(0, 2).map((quest) => (
                        <li key={quest.slug}>
                          <QuestSuggestionRow quest={quest} />
                        </li>
                      ))}
                    </ul>
                  </PaperCard>
                )}
                <div className="flex justify-center pt-1">
                  <GentleLink
                    variant={questCount === 0 ? "primary" : "text"}
                    size={questCount === 0 ? undefined : "sm"}
                    href="/app/quests"
                  >
                    {questCount === 0
                      ? canAddQuest
                        ? t.quests.pickCta
                        : "Browse and save quests"
                      : canAddQuest
                        ? t.quests.addAnother
                        : "Browse and save quests"}{" "}
                    <IconArrowRight size={questCount === 0 ? undefined : 14} />
                  </GentleLink>
                </div>
              </HomeQuestCategory>
              <HomeQuestCategory
                label={t.quests.groupCompleted}
                items={questGroups.completed}
                emptyBody="Completed quests will gather here."
              />
            </div>
          </HomeQuestDisclosure>

          {/* Home shows only the larger tree sprite; the full living scene
              remains on Journey where its accents have room to breathe. */}
          <Link href="/app/journey" className="block">
            <PaperCard
              interactive
              variant="linen"
              padding="md"
              className="flex items-center gap-4"
            >
              <GrowthTree
                state={tree}
                size={96}
                treeOnly
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h2 className="mb-2.5 font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent">
                  {t.home.yourGrowth}
                </h2>
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
              subtitle="Say what’s on your mind. Save it in your private-by-default journal."
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
              href="/app/prayer/reflections"
              sprite="sun"
              title={t.titles.reflections}
              subtitle={t.home.reflectionHint}
            />
          </div>

          <ExplorePlusLink
            className="mt-1"
            description="See every live wallpaper and the complete Plus experience."
          />

        </div>
      </PageContainer>
    </div>
  );
}

function TodaysVerseLink() {
  return (
    <motion.div variants={riseIn} initial="hidden" animate="visible">
      <Link
        href="/app/bible"
        className="group relative isolate flex min-h-16 items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border border-evergreen-600 bg-evergreen-700 px-4 py-3 text-[#fdfbf3] paper-shadow-lg transition-all duration-300 [transition-timing-function:var(--ease-gentle)] hover:-translate-y-0.5 hover:bg-evergreen-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0"
      >
        <span
          aria-hidden="true"
          className="ambient absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gold-300/15 blur-2xl [animation:var(--animate-twinkle)]"
        />
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#fdfbf3]/10 ring-1 ring-[#fdfbf3]/20">
          <PixelIcon name="open-book" size={4} animate />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block font-display text-[1.125rem] leading-tight">
            View Today&apos;s Verse
          </span>
          <span className="mt-1 block text-caption text-[#fdfbf3]/70">
            A quiet word is waiting in the Bible.
          </span>
        </span>
        <IconArrowRight className="relative shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
      </Link>
    </motion.div>
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
