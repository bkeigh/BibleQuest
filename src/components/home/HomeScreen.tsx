"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuestOS, selectDaysAway } from "@/lib/questos/store";
import { calculateTreeState } from "@/lib/questos/growth-engine";
import { getDailyVerse } from "@/lib/questos/verse-engine";
import { timeOfDay, toDateKey, formatFriendlyDate } from "@/lib/utils/dates";
import { greeting, returnLine, dayCompleteLines } from "@/lib/questos/copy";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { firstName } from "@/lib/utils/name";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { VerseCard } from "@/components/bible/VerseCard";
import { QuestSlip } from "@/components/quests/QuestSlip";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { PixelIcon, CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";
import { IconArrowRight, IconChevronRight } from "@/components/design-system/icons";
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
  const getTodayAssignment = useQuestOS((s) => s.getTodayAssignment);
  const ensureDailyQuest = useQuestOS((s) => s.ensureDailyQuest);
  const rerollTodayQuest = useQuestOS((s) => s.rerollTodayQuest);
  const journeyEvents = useQuestOS((s) => s.journeyEvents);
  // Keep day-scoped content fresh when the local day rolls over while the app
  // is left open (or the tab regains focus) — otherwise the verse and date
  // silently show "yesterday".
  const [dayKey, setDayKey] = useState(() => toDateKey());
  // Subscribe to today's assignment slice so reroll/completion re-renders Home.
  const todayAssignment = useQuestOS((s) => s.assignments[dayKey]);

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

  // Persist today's quest once per day (never during render).
  useEffect(() => {
    ensureDailyQuest();
  }, [dayKey, ensureDailyQuest]);

  const tree = useMemo(() => calculateTreeState(growthEvents), [growthEvents]);
  const verse = useMemo(() => getDailyVerse(dayKey), [dayKey]);
  const season = useMemo(() => getCurrentSeason(), []);
  // Prefer the persisted assignment; fall back to a deterministic preview on the
  // very first render before ensureDailyQuest() has run.
  const today = useMemo(() => {
    if (todayAssignment) {
      const quest = questBySlug.get(todayAssignment.questSlug);
      if (quest) return { assignment: todayAssignment, quest };
    }
    return getTodayAssignment();
  }, [todayAssignment, getTodayAssignment, dayKey]);
  const name = firstName(profile?.displayName);
  const time = timeOfDay();

  const completedToday = today?.assignment.status === "completed";
  const todayKey = dayKey;
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
        <header className="pt-10 pb-6">
          <p className="text-[0.8125rem] uppercase tracking-[0.16em] text-olive-500">
            {formatFriendlyDate(todayKey)} · {season.label}
          </p>
          <h1 className="mt-2 font-display text-[2rem] leading-tight text-graphite">
            {greeting(time, name)}
          </h1>
          <p className="mt-1 text-[1.0625rem] text-ash">{returnLine(daysAway)}</p>
        </header>

        <div className="space-y-5 pb-4">
          {/* Today's verse */}
          <VerseCard verse={verse} />

          {/* Today's quest — the one primary action, or a peaceful complete state */}
          {today && !completedToday && (
            <section aria-label="Today's quest">
              <SectionLabel>Today’s quest</SectionLabel>
              <QuestSlip quest={today.quest} href={`/app/quests/${today.quest.slug}`} />
              <div className="mt-2.5 flex items-center gap-4">
                <GentleLink
                  variant="dark"
                  href={`/app/quests/${today.quest.slug}`}
                  className="flex-1"
                >
                  Begin <IconArrowRight />
                </GentleLink>
                <button
                  onClick={rerollTodayQuest}
                  className="text-[0.875rem] text-ash transition-colors hover:text-charcoal"
                >
                  Something else?
                </button>
              </div>
            </section>
          )}

          {completedToday && today && (
            <PaperCard variant="atmospheric" padding="lg" className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-olive-50 ring-1 ring-olive-100">
                <PixelIcon name={CATEGORY_SPRITE[today.quest.category] ?? "leaf"} size={6} animate />
              </div>
              <h2 className="font-display text-[1.375rem] text-graphite">
                {dayCompleteLines.title}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-charcoal">
                {dayCompleteLines.body}
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
          )}

          {/* Quick prayer */}
          <QuickRow
            href="/app/prayer/new"
            sprite="candle"
            title="Take one quiet minute"
            subtitle="Bring what you’re carrying to God."
          />

          {/* Growth preview */}
          <Link href="/app/journey" className="block">
            <PaperCard interactive padding="md" className="flex items-center gap-4">
              <GrowthTree state={tree} size={92} showGround={false} />
              <div className="min-w-0 flex-1">
                <SectionLabel>Your pilgrimage</SectionLabel>
                <p className="font-display text-[1.25rem] text-graphite">
                  {tree.stageLabel}
                </p>
                <p className="mt-0.5 text-[0.875rem] text-ash">
                  {tree.totalActions === 0
                    ? "Your tree is waiting for its first small step."
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
                : "Read a chapter in a calm, quiet reader."
            }
          />

          {/* Recent growth */}
          {recent.length > 0 && (
            <section aria-label="Recent activity" className="pt-1">
              <SectionLabel>Recently</SectionLabel>
              <PaperCard variant="quiet" padding="sm">
                <ul className="divide-y divide-mist/70">
                  {recent.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-olive-300" />
                      <span className="flex-1 text-[0.9375rem] text-charcoal">
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
    <p className="mb-2 text-[0.75rem] uppercase tracking-[0.16em] text-olive-500">
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
          <p className="text-[1rem] text-graphite">{title}</p>
          <p className="text-[0.8125rem] text-ash">{subtitle}</p>
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
