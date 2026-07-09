"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  useQuestOS,
  selectDaysAway,
  selectTodayPicks,
  MAX_DAILY_PICKS,
} from "@/lib/questos/store";
import { calculateTreeState } from "@/lib/questos/growth-engine";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { timeOfDay, toDateKey, formatFriendlyDate } from "@/lib/utils/dates";
import { returnLine } from "@/lib/questos/copy";
import { useStrings, fmt } from "@/lib/i18n";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { firstName } from "@/lib/utils/name";
import { celebrationScale } from "@/lib/motion";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { VerseCard } from "@/components/bible/VerseCard";
import { QuestSlip } from "@/components/quests/QuestSlip";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import {
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconSettings,
} from "@/components/design-system/icons";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { questBySlug } from "@/data/seed/quests";

function HomeInner() {
  const profile = useQuestOS((s) => s.profile);
  // Snapshot how long they've been away ONCE, at mount — before AppShell's
  // recordVisit() overwrites lastVisitDateKey to today. A reactive read would
  // flip the warm "welcome back" line to same-day copy ~400ms in.
  const [daysAway] = useState(() => selectDaysAway(useQuestOS.getState()));
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const readingPosition = useQuestOS((s) => s.readingPosition);
  const journeyEvents = useQuestOS((s) => s.journeyEvents);
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
  const verse = useMemo(() => getDailyVerse(dayKey), [dayKey]);
  const season = useMemo(() => getCurrentSeason(), []);
  const name = firstName(profile?.displayName);
  const time = timeOfDay();
  const t = useStrings();
  const hello = `${t.greeting[time]}${name ? `, ${name}` : ""}.`;

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
        {/* Greeting */}
        <header className="flex items-start justify-between gap-4 pt-10 pb-6">
          <div>
            <p className="text-caption uppercase tracking-[0.16em] text-accent">
              {formatFriendlyDate(dayKey)} · {season.label}
            </p>
            <h1 className="mt-2 font-display text-editorial text-graphite">
              {hello}
            </h1>
            <p className="mt-1 text-body text-ash">{returnLine(daysAway)}</p>
          </div>
          <Link
            href="/app/settings"
            aria-label={t.home.openSettings}
            className="mt-8 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ash transition-colors duration-300 hover:bg-linen hover:text-charcoal"
          >
            <IconSettings size={21} />
          </Link>
        </header>

        <div className="space-y-5 pb-4">
          {/* Today's verse */}
          <VerseCard verse={verse} />

          {/* Today's quests — empty, picked (1-3), or day complete */}
          <section aria-label={t.home.todaysQuests}>
            {/* Announce pick/completion changes to screen readers. */}
            <p aria-live="polite" className="sr-only">
              {pickCount === 0
                ? t.quests.emptyTitle
                : allDone
                  ? t.dayComplete.title
                  : `${completedCount} of ${pickCount} quests completed.`}
            </p>

            {pickCount === 0 && (
              <PaperCard variant="outlined" padding="lg" className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface">
                  <PixelIcon name="lantern" size={5} animate />
                </div>
                <h2 className="font-display text-subheading text-graphite">
                  {t.quests.emptyTitle}
                </h2>
                <p className="mx-auto mt-1.5 max-w-sm text-small leading-relaxed text-charcoal">
                  {t.quests.emptyBody}
                </p>
                <div className="mt-4 flex justify-center">
                  <GentleLink variant="primary" href="/app/quests">
                    {t.quests.pickCta} <IconArrowRight />
                  </GentleLink>
                </div>
              </PaperCard>
            )}

            {pickCount > 0 && !allDone && (
              <>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="font-pixel text-small uppercase tracking-[0.1em] text-accent">
                    {t.home.todaysQuests}
                  </p>
                  <p className="text-caption text-ash">
                    {fmt(t.quests.picked, { n: pickCount })}
                  </p>
                </div>
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
                  <h2 className="font-display text-editorial text-graphite">
                    {t.dayComplete.title}
                  </h2>
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

          {/* Quick prayer */}
          <QuickRow
            href="/app/prayer/new"
            sprite="candle"
            title="One minute of prayer"
            subtitle="Say what’s on your mind. It stays private."
          />

          {/* Growth preview */}
          <Link href="/app/journey" className="block">
            <PaperCard interactive padding="md" className="flex items-center gap-4">
              <GrowthTree state={tree} size={92} showGround={false} />
              <div className="min-w-0 flex-1">
                <SectionLabel>{t.home.yourGrowth}</SectionLabel>
                <p className="font-display text-subheading text-graphite">
                  {tree.stageLabel}
                </p>
                <p className="mt-0.5 text-caption text-ash">
                  {tree.totalActions === 0
                    ? "Complete one quest and your tree starts growing."
                    : `${tree.totalActions} meaningful ${
                        tree.totalActions === 1 ? "step" : "steps"
                      } so far.`}
                </p>
              </div>
              <IconChevronRight className="text-fog" />
            </PaperCard>
          </Link>

          {/* Continue reading */}
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

          {/* Recent growth */}
          {recent.length > 0 && (
            <section aria-label="Recent activity" className="pt-1">
              <SectionLabel>{t.home.recently}</SectionLabel>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
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

export function HomeScreen() {
  return (
    <ClientOnly>
      <HomeInner />
    </ClientOnly>
  );
}
