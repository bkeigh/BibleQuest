"use client";

import { useMemo } from "react";
import { useQuestOS } from "@/lib/questos/store";
import { calculateTreeState, stageProgress } from "@/lib/questos/growth-engine";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { GROWTH_MEANINGS } from "@/lib/questos/growth-engine";
import { treeReturnLine, treeStageLabels, emptyStates } from "@/lib/questos/copy";
import { seedMilestones } from "@/data/seed/milestones";
import { formatShortDate } from "@/lib/utils/dates";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import { useStrings, fmt } from "@/lib/i18n";
import type {
  GrowthType,
  JourneyEvent,
  JourneyEventType,
  TreeStage,
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

/** The stage that follows each stage — for the progression bar's far label. */
const NEXT_STAGE: Partial<Record<TreeStage, TreeStage>> = {
  seed: "sprout",
  sprout: "young",
  young: "growing",
  growing: "fruit-bearing",
  "fruit-bearing": "sheltering",
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

function JourneyScreenInner() {
  const t = useStrings();
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const journeyEvents = useQuestOS((s) => s.journeyEvents);
  const earned = useQuestOS((s) => s.earnedMilestones);
  const lastVisit = useQuestOS((s) => s.lastVisitDateKey);

  const tree = useMemo(() => calculateTreeState(growthEvents), [growthEvents]);
  // Progress through the current stage — "small steps", never points.
  const progress = stageProgress(tree);
  const nextStage = NEXT_STAGE[tree.stage];
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

  const earnedKeys = useMemo(() => new Set(earned.map((e) => e.key)), [earned]);
  const nextMilestones = useMemo(
    () => seedMilestones.filter((m) => !earnedKeys.has(m.key)).slice(0, 3),
    [earnedKeys]
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

        {/* Milestones */}
        {(earned.length > 0 || nextMilestones.length > 0) && (
          <section className="mt-6">
            <h2 className="mb-2.5 font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent">
              Milestones
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {earned.map((e) => {
                const m = seedMilestones.find((x) => x.key === e.key);
                if (!m) return null;
                return (
                  <span
                    key={e.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/45 bg-gold-500/15 px-3 py-1.5 font-pixel text-[0.875rem] text-gilt"
                  >
                    <PixelIcon name={(m.iconKey as PixelSpriteName) ?? "star"} size={3} />
                    {m.title}
                  </span>
                );
              })}
              {nextMilestones.map((m) => (
                <span
                  key={m.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-linen px-3 py-1.5 font-pixel text-[0.875rem] text-ash"
                >
                  <PixelIcon name={(m.iconKey as PixelSpriteName) ?? "star"} size={3} />
                  {m.title}
                </span>
              ))}
            </div>
          </section>
        )}

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
