"use client";

import { useMemo } from "react";
import { useQuestOS } from "@/lib/questos/store";
import {
  calculateTreeState,
  GROWTH_MEANINGS,
  nextTreeStage,
  stageProgress,
} from "@/lib/questos/growth-engine";
import { computeMetrics } from "@/lib/questos/milestone-engine";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { treeReturnLine, treeStageLabels, emptyStates } from "@/lib/questos/copy";
import { seedMilestones } from "@/data/seed/milestones";
import { questBySlug } from "@/data/seed/quests";
import { formatShortDate } from "@/lib/utils/dates";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { useStrings, fmt } from "@/lib/i18n";
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

const EVENT_SPRITE: Record<JourneyEventType, PixelSpriteName> = {
  quest_completed: "leaf",
  reflection_written: "sun",
  prayer_created: "candle",
  prayer_answered: "flower",
  chapter_read: "book",
  verse_bookmarked: "bookmark",
  milestone_reached: "star",
};

/** Sanctuary preview tiles — a quiet promise of personal touches to come.
    Nothing here is purchasable or gated; it simply names what's ahead. */
const SANCTUARY_TILES: { label: string; sprite: PixelSpriteName; size: number }[] = [
  { label: "Backgrounds", sprite: "star", size: 5 },
  { label: "Tree styles", sprite: "tree", size: 4 },
  { label: "Candle styles", sprite: "candle-steady", size: 2 },
  { label: "Garden", sprite: "flower", size: 4 },
];

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
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
      className={
        reached
          ? "h-full rounded-[var(--radius-card)] border border-gold-500/45 bg-gold-500/10 p-4"
          : "h-full rounded-[var(--radius-card)] border border-mist bg-linen p-4"
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            reached
              ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-500/15"
              : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper"
          }
        >
          <PixelIcon name={(milestone.iconKey as PixelSpriteName) ?? "star"} size={4} />
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
        <PixelIcon name={(milestone.iconKey as PixelSpriteName) ?? "star"} size={3} />
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
  const t = useStrings();
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const journeyEvents = useQuestOS((s) => s.journeyEvents);
  const earned = useQuestOS((s) => s.earnedMilestones);
  const lastVisit = useQuestOS((s) => s.lastVisitDateKey);
  const completions = useQuestOS((s) => s.completions);
  const prayers = useQuestOS((s) => s.prayers);
  const reflections = useQuestOS((s) => s.reflections);
  const chaptersRead = useQuestOS((s) => s.chaptersRead);
  const bookmarks = useQuestOS((s) => s.bookmarks);

  const tree = useMemo(() => calculateTreeState(growthEvents), [growthEvents]);
  // Progress through the current stage — "small steps", never points.
  const progress = stageProgress(tree);
  const nextStage = nextTreeStage(tree.stage);
  const timeline = useMemo(
    () => [...journeyEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [journeyEvents]
  );

  // Group the timeline by month, newest first. The current (most recent)
  // month starts open; older months collapse.
  const months = useMemo(() => {
    const groups: { label: string; events: JourneyEvent[] }[] = [];
    for (const e of timeline) {
      const label = monthLabel(e.occurredAt);
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
      ...milestoneViews.reached.slice(0, 3),
      ...milestoneViews.upcoming.slice(0, 4),
    ],
    [milestoneViews]
  );

  const returning = timeline.length > 0 && lastVisit !== null;

  return (
    <>
      <PageHeader title="Journey" subtitle="What’s grown so far." />
      <PageContainer>
        {/* Growth tree hero */}
        <PaperCard variant="atmospheric" padding="lg" className="relative overflow-hidden text-center">
          <div className="pointer-events-none absolute inset-0">
            <SeasonalAtmosphere density={6} />
          </div>
          <div className="relative flex justify-center">
            <GrowthTree state={tree} size={240} />
          </div>
          <h2 className="relative mt-2 font-display text-[1.5rem] text-graphite">
            {tree.stageLabel}
          </h2>
          <p className="relative mt-1 text-[0.9375rem] text-ash">
            {tree.totalActions === 0
              ? "Complete one quest and it starts growing."
              : returning
                ? `${tree.totalActions} meaningful steps have shaped it.`
                : treeReturnLine}
          </p>

          {/* Gentle progression — small steps toward the next stage. At the
              final stage the bar simply rests full; nothing counts down. */}
          <div className="relative mx-auto mt-4 w-full max-w-[17rem]">
            <div className="flex items-baseline justify-between text-caption text-ash">
              <span>{tree.stageLabel}</span>
              {nextStage && <span>{treeStageLabels[nextStage]}</span>}
            </div>
            <div
              aria-hidden="true"
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mist/60"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700 [transition-timing-function:var(--ease-gentle)]"
                style={{ width: `${(progress?.fraction ?? 1) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-caption text-ash">
              {progress && tree.toNextStage != null
                ? tree.toNextStage === 1
                  ? t.journey.toNextOne
                  : fmt(t.journey.toNext, { n: tree.toNextStage })
                : t.journey.fullGrown}
            </p>
          </div>

          {/* Growth breakdown — gentle, not a chart */}
          {tree.totalActions > 0 && (
            <div className="relative mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-left sm:grid-cols-3">
              {GROWTH_ORDER.filter((g) => tree.byType[g] > 0).map((g) => (
                <div key={g} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-olive-300" />
                  <span className="text-[0.8125rem] text-charcoal">
                    {GROWTH_MEANINGS[g]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PaperCard>

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
            tabIndex={0}
            className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain rounded-[var(--radius-button)] px-1 pb-3 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
            <div className="divide-y divide-mist">
              {milestoneViews.all.map((view) => (
                <MilestoneListRow key={view.milestone.key} view={view} />
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
              <PixelMascot name="sprout" size={8} className="mb-4" />
              <p className="text-[0.9375rem] text-ash">{emptyStates.journey}</p>
            </div>
          ) : (
            <DisclosureGroup>
              {months.map((month, i) => (
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
                  <ol className="relative ml-2 mt-1 border-l border-mist">
                    {month.events.map((e) => (
                      <li key={e.id} className="relative ml-6 pb-6 last:pb-0">
                        <span className="absolute -left-[2.05rem] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-parchment ring-1 ring-mist">
                          <PixelIcon name={EVENT_SPRITE[e.type]} size={3} />
                        </span>
                        <p className="text-[0.9375rem] text-charcoal">{e.title}</p>
                        <p className="mt-0.5 text-[0.75rem] text-ash">
                          {formatShortDate(e.occurredAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </Disclosure>
              ))}
            </DisclosureGroup>
          )}
        </section>

        {/* Sanctuary — personal touches on the way. A quiet closing note:
            nothing purchasable, nothing locked, nothing required. */}
        <section className="mt-7 pb-6">
          <Disclosure
            variant="card"
            label={
              <span className="text-[0.9375rem] font-medium text-graphite">
                {t.journey.sanctuary}
              </span>
            }
            summary={
              <span className="rounded-full bg-accent-surface px-2 py-0.5 text-[0.8125rem] font-medium text-accent">
                Soon
              </span>
            }
          >
            <p className="text-[0.875rem] leading-relaxed text-ash">
              {t.journey.sanctuarySoon}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {SANCTUARY_TILES.map((tile) => (
                <PaperCard
                  key={tile.label}
                  variant="quiet"
                  padding="sm"
                  className="flex flex-col items-center gap-1.5 text-center"
                >
                  <span className="flex h-8 items-center opacity-80">
                    <PixelIcon name={tile.sprite} size={tile.size} />
                  </span>
                  <span className="text-[0.875rem] text-charcoal">{tile.label}</span>
                  <span className="text-[0.75rem] text-ash">Coming soon</span>
                </PaperCard>
              ))}
            </div>
          </Disclosure>
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
