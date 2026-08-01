"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuestOS } from "@/lib/questos/store";
import {
  calculateTreeState,
  nextTreeStage,
  stageProgress,
  summarizeRecentGrowth,
} from "@/lib/questos/growth-engine";
import { computeMetrics } from "@/lib/questos/milestone-engine";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { treeStageLabels, emptyStates } from "@/lib/questos/copy";
import { seedMilestones } from "@/data/seed/milestones";
import { questBySlug } from "@/data/seed/quests";
import { formatShortDate } from "@/lib/utils/dates";
import { useCurrentDayKey } from "@/lib/use-current-day-key";
import type {
  GrowthType,
  JourneyEvent,
  JourneyEventType,
  MilestoneMetric,
  MilestoneSeed,
} from "@/lib/questos/types";

const GROWTH_ORDER: GrowthType[] = [
  "roots",
  "branches",
  "leaves",
  "fruit",
  "sunlight",
  "flowers",
];

interface GrowthFacet {
  label: string;
  meaning: string;
  invitation: string;
  href: string;
  sprite: PixelSpriteName;
}

/** Six symbolic facets make every kind of tending legible without ranking it. */
const GROWTH_FACETS: Record<GrowthType, GrowthFacet> = {
  roots: {
    label: "Roots",
    meaning: "Grounding and steadiness",
    invitation: "Make space to pray",
    href: "/app/prayer/new",
    sprite: "candle",
  },
  branches: {
    label: "Branches",
    meaning: "Learning and direction",
    invitation: "Open Scripture",
    href: "/app/bible",
    sprite: "book",
  },
  leaves: {
    label: "Leaves",
    meaning: "Care taking shape",
    invitation: "Find a practice",
    href: "/app/quests",
    sprite: "leaf",
  },
  fruit: {
    label: "Fruit",
    meaning: "Love put into practice",
    invitation: "Find a way to serve",
    href: "/app/quests",
    sprite: "service-basket",
  },
  sunlight: {
    label: "Sunlight",
    meaning: "Attention and reflection",
    invitation: "Write a reflection",
    href: "/app/prayer/reflection/new",
    sprite: "sun",
  },
  flowers: {
    label: "Flowers",
    meaning: "Gratitude and joy",
    invitation: "Notice what is good",
    href: "/app/quests",
    sprite: "flower",
  },
};

const EVENT_SPRITE: Record<JourneyEventType, PixelSpriteName> = {
  quest_completed: "leaf",
  reflection_written: "sun",
  prayer_created: "candle",
  prayer_answered: "flower",
  chapter_read: "book",
  verse_bookmarked: "bookmark",
  milestone_reached: "star",
};

function monthLabel(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

const MILESTONE_GROUPS = [
  ["first_step", "Beginnings"],
  ["rhythm", "Rhythm"],
  ["scripture", "Scripture"],
  ["prayer", "Prayer"],
  ["kindness", "Love in action"],
  ["depth", "Depth"],
] as const;

/** Describe progress as a season of growth rather than an action countdown. */
function stageSeasonLine(fraction: number, final: boolean): string {
  if (final) return "Fully grown, and still changing with you.";
  if (fraction < 0.34) return "A new season of growth is beginning.";
  if (fraction < 0.67) return "This season is taking root.";
  return "A new shape is beginning to show.";
}

interface MilestoneView {
  milestone: MilestoneSeed;
  current: number;
  fraction: number;
  achievedAt?: string;
}

function metricUnit(metric: MilestoneMetric, count: number): string {
  const plural = count !== 1;
  switch (metric) {
    case "journey_days":
      return plural ? "days" : "day";
    case "prayers_created":
      return plural ? "prayers" : "prayer";
    case "reflections_created":
      return plural ? "reflections" : "reflection";
    case "prayers_answered":
      return plural ? "answers" : "answer";
    case "chapters_read":
      return plural ? "chapters" : "chapter";
    case "verses_bookmarked":
      return plural ? "verses" : "verse";
    default:
      return plural ? "quests" : "quest";
  }
}

function milestoneStatus(view: MilestoneView): string {
  if (view.achievedAt) return `Reached ${formatShortDate(view.achievedAt)}`;
  const current = Math.min(view.current, view.milestone.requirementCount);
  return `${current} of ${view.milestone.requirementCount} ${metricUnit(
    view.milestone.requirementMetric,
    view.milestone.requirementCount
  )}`;
}

function MilestoneHighlight({ view }: { view: MilestoneView }) {
  const reached = Boolean(view.achievedAt);
  const { milestone } = view;

  return (
    <article
      data-milestone-state={reached ? "reached" : "upcoming"}
      className="milestone-glass-surface h-full rounded-[var(--radius-card)] border p-4"
    >
      <div className="flex items-start gap-3">
        <span
          className={
            reached
              ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100/85 ring-1 ring-gold-500/35"
              : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper/85 ring-1 ring-mist/70"
          }
        >
          <PixelIcon name={(milestone.iconKey as PixelSpriteName) ?? "star"} size={56} />
        </span>
        <div className="min-w-0">
          <p className="font-pixel text-[0.875rem] leading-tight text-graphite">
            {milestone.title}
          </p>
          <p className="mt-1 text-[0.75rem] leading-snug text-ash">
            {milestoneStatus(view)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[0.8125rem] leading-snug text-charcoal">
        {milestone.description}
      </p>
      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-mist/70"
        role="progressbar"
        aria-label={`${milestone.title}: ${milestoneStatus(view)}`}
        aria-valuemin={0}
        aria-valuemax={milestone.requirementCount}
        aria-valuenow={Math.min(view.current, milestone.requirementCount)}
      >
        <span
          className={reached ? "block h-full bg-gold-500" : "block h-full bg-accent"}
          style={{ width: `${view.fraction * 100}%` }}
        />
      </div>
    </article>
  );
}

function MilestoneListRow({ view }: { view: MilestoneView }) {
  const reached = Boolean(view.achievedAt);
  const { milestone } = view;

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={
          reached
            ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500/15"
            : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper"
        }
      >
        <PixelIcon name={(milestone.iconKey as PixelSpriteName) ?? "star"} size={48} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-[0.9375rem] font-medium text-graphite">{milestone.title}</p>
          <p className={reached ? "text-[0.75rem] text-gilt" : "text-[0.75rem] text-ash"}>
            {milestoneStatus(view)}
          </p>
        </div>
        <p className="mt-0.5 text-[0.8125rem] leading-snug text-ash">
          {milestone.description}
        </p>
      </div>
    </div>
  );
}

function JourneyScreenInner() {
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const journeyEvents = useQuestOS((s) => s.journeyEvents);
  const earned = useQuestOS((s) => s.earnedMilestones);
  const reconcileMilestones = useQuestOS((s) => s.reconcileMilestones);
  const completions = useQuestOS((s) => s.completions);
  const prayers = useQuestOS((s) => s.prayers);
  const reflections = useQuestOS((s) => s.reflections);
  const chaptersRead = useQuestOS((s) => s.chaptersRead);
  const bookmarks = useQuestOS((s) => s.bookmarks);
  const dayKey = useCurrentDayKey();
  const [visibleMonthCount, setVisibleMonthCount] = useState(4);

  // Catalogue additions are awarded quietly from existing history. New user
  // actions still receive the normal acknowledgement at the moment they occur.
  useEffect(() => {
    reconcileMilestones();
  }, [
    bookmarks,
    chaptersRead,
    completions,
    journeyEvents,
    prayers,
    reconcileMilestones,
    reflections,
  ]);

  const tree = useMemo(() => calculateTreeState(growthEvents), [growthEvents]);
  const recentGrowth = useMemo(
    () => summarizeRecentGrowth(growthEvents, dayKey),
    [dayKey, growthEvents]
  );
  // Progress through the current stage — "small steps", never points.
  const progress = stageProgress(tree);
  const nextStage = nextTreeStage(tree.stage);
  const timeline = useMemo(
    () =>
      [...journeyEvents].sort(
        (a, b) =>
          b.dateKey.localeCompare(a.dateKey) ||
          b.occurredAt.localeCompare(a.occurredAt)
      ),
    [journeyEvents]
  );

  // Group the timeline by month, newest first. The current (most recent)
  // month starts open; older months collapse.
  const months = useMemo(() => {
    const groups: { label: string; events: JourneyEvent[] }[] = [];
    for (const e of timeline) {
      const label = monthLabel(e.dateKey);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.events.push(e);
      } else {
        groups.push({ label, events: [e] });
      }
    }
    return groups;
  }, [timeline]);

  const metrics = useMemo(
    () =>
      computeMetrics({
        completions,
        prayers,
        reflections,
        chaptersRead,
        bookmarks,
        journeyEvents,
        questBySlug,
      }),
    [bookmarks, chaptersRead, completions, journeyEvents, prayers, reflections]
  );

  const milestoneViews = useMemo(() => {
    const achieved = new Map(earned.map((item) => [item.key, item.achievedAt]));
    const views = seedMilestones.map<MilestoneView>((milestone) => {
      const current = Math.max(0, metrics[milestone.requirementMetric] ?? 0);
      const achievedAt = achieved.get(milestone.key);
      return {
        milestone,
        current: achievedAt ? Math.max(current, milestone.requirementCount) : current,
        fraction: achievedAt
          ? 1
          : Math.min(1, current / milestone.requirementCount),
        achievedAt,
      };
    });
    const reached = views
      .filter((view) => view.achievedAt)
      .sort((a, b) => (b.achievedAt ?? "").localeCompare(a.achievedAt ?? ""));
    const upcoming = views
      .filter((view) => !view.achievedAt)
      .sort(
        (a, b) =>
          b.fraction - a.fraction ||
          a.milestone.requirementCount - a.current -
            (b.milestone.requirementCount - b.current) ||
          a.milestone.requirementCount - b.milestone.requirementCount
      );
    return { reached, upcoming, all: [...reached, ...upcoming] };
  }, [earned, metrics]);

  const milestoneHighlights = useMemo(
    () => [
      ...milestoneViews.reached.slice(0, 1),
      ...milestoneViews.upcoming.slice(0, 3),
    ],
    [milestoneViews]
  );

  const milestoneGroups = useMemo(
    () =>
      MILESTONE_GROUPS.map(([key, label]) => ({
        key,
        label,
        views: milestoneViews.all.filter(
          (view) => view.milestone.milestoneType === key
        ),
      })).filter((group) => group.views.length > 0),
    [milestoneViews]
  );
  const visibleMonths = months.slice(0, visibleMonthCount);
  const finalStage = nextStage === null;

  return (
    <>
      <PageHeader title="Journey" subtitle="What’s grown so far." />
      <PageContainer>
        {/* Growth tree hero */}
        <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden text-center">
          <div className="relative flex justify-center">
            <GrowthTree state={tree} size={224} />
          </div>
          <h2 className="relative mt-2 font-display text-[1.5rem] text-graphite">
            {tree.stageLabel}
          </h2>
          <p className="relative mt-1 text-[0.9375rem] text-ash">
            {tree.totalActions === 0
              ? "One meaningful step is enough to begin."
              : "Every meaningful practice leaves a mark. Growth never fades."}
          </p>

          {/* The tree shows direction without turning practice into points. */}
          <div className="relative mx-auto mt-4 w-full max-w-[17rem]">
            <div className="flex items-baseline justify-between text-caption text-ash">
              <span>{tree.stageLabel}</span>
              {nextStage && <span>{treeStageLabels[nextStage]}</span>}
            </div>
            <div
              role="progressbar"
              aria-label={`Growth from ${tree.stageLabel}${
                nextStage ? ` toward ${treeStageLabels[nextStage]}` : ""
              }`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((progress?.fraction ?? 1) * 100)}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mist/60"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700 [transition-timing-function:var(--ease-gentle)]"
                style={{ width: `${(progress?.fraction ?? 1) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-caption text-ash">
              {stageSeasonLine(progress?.fraction ?? 1, finalStage)}
            </p>
          </div>

          {tree.totalActions === 0 && (
            <GentleLink
              href="/app/quests"
              variant="primary"
              size="sm"
              className="relative mt-5"
            >
              Plant your first step
            </GentleLink>
          )}
        </PaperCard>

        {/* A rolling recap adds memory without introducing weekly goals. */}
        <section className="mt-6" aria-labelledby="week-heading">
          <div className="mb-2.5">
            <h2
              id="week-heading"
              className="font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent"
            >
              This week
            </h2>
            <p className="mt-1 text-[0.8125rem] text-ash">
              A look back, never a target to meet.
            </p>
          </div>
          <PaperCard variant="quiet" padding="md">
            {recentGrowth.totalSteps > 0 ? (
              <>
                <p className="text-[0.9375rem] text-graphite">
                  Your tree was tended {recentGrowth.activeDays === 1
                    ? "on one day"
                    : `across ${recentGrowth.activeDays} days`}.
                </p>
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Growth tended this week">
                  {recentGrowth.activeGrowthTypes.map((type) => {
                    const facet = GROWTH_FACETS[type];
                    return (
                      <span
                        key={type}
                        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-mist bg-paper/80 px-3 text-caption text-charcoal"
                      >
                        <PixelIcon name={facet.sprite} size={36} />
                        {facet.label}
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3">
                {/* The seed sprite sits inside a lot of transparent canvas, so
                    a 28px box drew a seed a few pixels across. */}
                <PixelIcon
                  name="tree-stage-0"
                  size={72}
                  className="-mt-2 shrink-0"
                />
                <div>
                  <p className="text-[0.9375rem] text-graphite">
                    Your tree is resting this week.
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-ash">
                    Nothing has been lost. Return whenever you are ready.
                  </p>
                </div>
              </div>
            )}
          </PaperCard>
        </section>

        {/* Every facet remains available, including those not yet tended. */}
        <section className="mt-6" aria-labelledby="nourish-heading">
          <div className="mb-2.5">
            <h2
              id="nourish-heading"
              className="font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent"
            >
              How your tree grows
            </h2>
            <p className="mt-1 text-[0.8125rem] text-ash">
              Different practices tend different parts of the same life.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {GROWTH_ORDER.map((type) => {
              const facet = GROWTH_FACETS[type];
              const tended = tree.byType[type] > 0;
              return (
                <Link
                  key={type}
                  href={facet.href}
                  className="app-glass-surface group rounded-[var(--radius-card)] border border-mist bg-paper p-3.5 transition-colors hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-surface">
                      <PixelIcon name={facet.sprite} size={48} />
                    </span>
                    <span
                      className={
                        tended
                          ? "rounded-full bg-gold-500/15 px-2 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-gilt"
                          : "rounded-full bg-linen px-2 py-1 text-[0.6875rem] uppercase tracking-[0.08em] text-ash"
                      }
                    >
                      {tended ? "Tended" : "Ready"}
                    </span>
                  </span>
                  <span className="mt-3 block text-[0.9375rem] font-medium text-graphite">
                    {facet.label}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] leading-snug text-ash">
                    {facet.meaning}
                  </span>
                  <span className="mt-2 block text-[0.75rem] font-medium text-accent group-hover:underline">
                    {facet.invitation}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Milestones — a compact side-scroll for the nearest markers, with
            the complete catalogue tucked into an accessible disclosure. */}
        <section className="mt-6" aria-labelledby="milestones-heading">
          <div className="mb-2.5 flex items-end justify-between gap-3">
            <div>
              <h2
                id="milestones-heading"
                className="font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent"
              >
                Milestones
              </h2>
              <p className="mt-1 text-[0.8125rem] text-ash">
                Markers along the road, never a race.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-accent-surface px-2.5 py-1 text-[0.75rem] font-medium text-accent">
              {milestoneViews.reached.length} of {seedMilestones.length}
            </span>
          </div>

          <ol
            className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-1 pb-3 [scrollbar-width:thin]"
            aria-label="Milestone highlights"
          >
            {milestoneHighlights.map((view) => (
              <li
                key={view.milestone.key}
                className="min-w-[15rem] max-w-[15rem] snap-start sm:min-w-[17rem] sm:max-w-[17rem]"
              >
                <MilestoneHighlight view={view} />
              </li>
            ))}
          </ol>

          <Disclosure
            variant="quiet"
            className="mt-1"
            label={<span className="text-[0.9375rem]">See every milestone</span>}
            summary={
              <span className="text-[0.75rem] font-normal text-ash">
                {seedMilestones.length} total
              </span>
            }
          >
            <div className="space-y-5">
              {milestoneGroups.map((group) => (
                <section key={group.key} aria-labelledby={`milestone-group-${group.key}`}>
                  <h3
                    id={`milestone-group-${group.key}`}
                    className="mb-2 text-caption font-medium uppercase tracking-[0.14em] text-ash"
                  >
                    {group.label}
                  </h3>
                  <div className="divide-y divide-mist">
                    {group.views.map((view) => (
                      <MilestoneListRow key={view.milestone.key} view={view} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </Disclosure>
        </section>

        {/* Timeline */}
        <section className="mt-7">
          <h2 className="mb-3 font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent">
            The road so far
          </h2>
          {timeline.length === 0 ? (
            <div className="py-6 text-center">
              <PixelMascot name="sprout" size={192} className="mb-4" />
              <p className="text-[0.9375rem] text-ash">{emptyStates.journey}</p>
            </div>
          ) : (
            <DisclosureGroup>
              {visibleMonths.map((month, i) => (
                <Disclosure
                  key={month.label}
                  defaultOpen={i === 0}
                  count={month.events.length}
                  label={
                    <span className="text-[0.9375rem] font-medium text-graphite">
                      {month.label}
                    </span>
                  }
                >
                  <ol className="relative ms-2 mt-1 border-s border-mist">
                    {month.events.map((e) => (
                      <li key={e.id} className="relative ms-6 pb-6 last:pb-0">
                        <span className="absolute -start-[2.05rem] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-parchment ring-1 ring-mist">
                          <PixelIcon name={EVENT_SPRITE[e.type]} size={48} />
                        </span>
                        <p className="text-[0.9375rem] text-charcoal">{e.title}</p>
                        <p className="mt-0.5 text-[0.75rem] text-ash">
                          {formatShortDate(`${e.dateKey}T12:00:00`)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </Disclosure>
              ))}
            </DisclosureGroup>
          )}
          {visibleMonthCount < months.length && (
            <GentleButton
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setVisibleMonthCount((count) => count + 4)}
            >
              Show earlier journey
            </GentleButton>
          )}
        </section>

        {/* Wallpaper customization has shipped, so Journey links to the real
            setting instead of promising a background feature that already exists. */}
        <section className="mt-7 pb-6">
          <PaperCard
            variant="atmospheric"
            padding="md"
            className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-surface">
              <PixelIcon name="star" size={56} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[1rem] font-medium text-graphite">Make the space yours</h2>
              <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ash">
                Choose still or live artwork, then let the glass surfaces carry it through.
              </p>
            </div>
            <GentleLink
              href="/app/settings#appearance"
              variant="outline"
              size="sm"
              className="shrink-0 self-stretch sm:self-auto"
            >
              Customize
            </GentleLink>
          </PaperCard>
        </section>
      </PageContainer>
    </>
  );
}

export function JourneyScreen() {
  return (
    <ClientOnly>
      <JourneyScreenInner />
    </ClientOnly>
  );
}
