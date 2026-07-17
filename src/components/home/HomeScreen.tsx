"use client";

/**
 * The daily landing screen. It composes the local-first QuestOS state into one
 * calm sequence: welcome and candle, verse, today's quest choices, growth,
 * active walks, and private next steps. Day-bound content refreshes in place
 * when a long-lived tab crosses local midnight.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  useQuestOS,
  selectStreak,
  selectTodayPicks,
  selectVerseRefreshCount,
  MAX_DAILY_PICKS,
} from "@/lib/questos/store";
import { calculateTreeState, stageProgress } from "@/lib/questos/growth-engine";
import { selectSuggestedQuests } from "@/lib/questos/quest-engine";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { timeOfDay, toDateKey } from "@/lib/utils/dates";
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
  IconCheck,
  IconChevronRight,
} from "@/components/design-system/icons";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { seedQuests, questBySlug } from "@/data/seed/quests";

function HomeInner() {
  const profile = useQuestOS((s) => s.profile);
  const settings = useQuestOS((s) => s.settings);
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const readingPosition = useQuestOS((s) => s.readingPosition);
  const journeyEvents = useQuestOS((s) => s.journeyEvents);
  const completions = useQuestOS((s) => s.completions);
  // The candle. Stable ref — the stored object itself.
  const streak = useQuestOS(selectStreak);
  // Today's "Another verse" count (primitive) + the action that grows it.
  const verseRefreshCount = useQuestOS(selectVerseRefreshCount);
  const refreshVerse = useQuestOS((s) => s.refreshVerse);
  // Today's picked quests (0..MAX_DAILY_PICKS). Stable ref — render-safe.
  const picks = useQuestOS(selectTodayPicks);
  // Keep day-scoped content fresh when the local day rolls over while the app
  // is left open (or the tab regains focus) — otherwise the verse and date
  // silently show "yesterday".
  const [dayKey, setDayKey] = useState(() => toDateKey());

  // Watch for a local day rollover: re-check on an interval, on focus, and on
  // visibility change. setDayKey is a no-op when the day hasn't changed.
  useEffect(() => {
    function check() {
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
  const season = useMemo(() => getCurrentSeason(), []);
  const name = profile?.displayName?.trim();
  const time = timeOfDay();
  const t = useStrings();
  const hello = t.greeting[time];

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
  const allDone = pickCount >= 1 && completedCount === pickCount;

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

  const recent = [...journeyEvents]
    .filter((e) => e.type !== "milestone_reached")
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 3);

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
        </header>

        <div className="space-y-4 pb-4">
          {/* Today's verse */}
          <VerseCard verse={verse} onAnotherVerse={refreshVerse} />

          {/* Today's quests — empty, picked (1-3), or day complete */}
          <section aria-label={t.home.todaysQuests}>
            {/* The loudest title on the page — the day's work anchors it. */}
            <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
              <h2 className="font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent min-[380px]:text-[1.75rem]">
                {t.home.todaysQuests}
              </h2>
              {pickCount === 0 ? (
                <PixelIcon name="scroll" size={5} />
              ) : !allDone && (
                <p className="text-caption text-ash">
                  {fmt(t.quests.picked, { n: pickCount })}
                </p>
              )}
            </div>

            {/* Announce pick/completion changes to screen readers. */}
            <p aria-live="polite" className="sr-only">
              {pickCount === 0
                ? t.quests.emptyTitle
                : allDone
                  ? t.dayComplete.title
                  : `${t.quests.completedToday}: ${completedCount}/${pickCount}`}
            </p>

            {pickCount === 0 && (
              <>
                <p className="mb-3 px-1 text-small text-ash">
                  {t.quests.emptyBody}
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
                    {t.quests.pickCta} <IconArrowRight />
                  </GentleLink>
                </div>
              </>
            )}

            {pickCount > 0 && !allDone && (
              <>
                <ul className="space-y-3">
                  {pickedQuests.map(({ pick, quest }) => {
                    const done = pick.status === "completed";
                    return (
                      <li key={quest.slug} className="relative">
                        <QuestSlip
                          quest={quest}
                          href={`/app/quests/${quest.slug}`}
                          className={done ? "opacity-60" : undefined}
                        />
                        {done && (
                          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent-surface px-2 py-0.5 text-caption text-accent-ink">
                            <IconCheck size={13} />
                            {t.common.done}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {pickCount < MAX_DAILY_PICKS && (
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
                    {t.dayComplete.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-small leading-relaxed text-charcoal">
                    {t.dayComplete.body}
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
          <QuestFeed />

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

          {/* Recent growth */}
          {recent.length > 0 && (
            <section aria-label="Recent activity" className="pt-1">
              <SectionLabel pixel>{t.home.recently}</SectionLabel>
              <PaperCard variant="quiet" padding="sm">
                <ul className="divide-y divide-mist/70">
                  {recent.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-olive-300" />
                      <span className="flex-1 text-small text-charcoal">
                        {e.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </PaperCard>
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
