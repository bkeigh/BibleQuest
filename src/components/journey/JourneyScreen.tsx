"use client";

import { useMemo } from "react";
import {
  useQuestOS,
  selectTreeState,
  selectTimeline,
} from "@/lib/questos/store";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { GROWTH_MEANINGS } from "@/lib/questos/growth-engine";
import { treeReturnLine, emptyStates } from "@/lib/questos/copy";
import { seedMilestones } from "@/data/seed/milestones";
import { formatShortDate } from "@/lib/utils/dates";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import type { GrowthType, JourneyEventType } from "@/lib/questos/types";

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

function JourneyScreenInner() {
  const tree = useQuestOS(selectTreeState);
  const timeline = useQuestOS(selectTimeline);
  const earned = useQuestOS((s) => s.earnedMilestones);
  const lastVisit = useQuestOS((s) => s.lastVisitDateKey);

  const earnedKeys = useMemo(() => new Set(earned.map((e) => e.key)), [earned]);
  const nextMilestones = useMemo(
    () => seedMilestones.filter((m) => !earnedKeys.has(m.key)).slice(0, 3),
    [earnedKeys]
  );

  const returning = timeline.length > 0 && lastVisit !== null;

  return (
    <>
      <PageHeader title="Journey" subtitle="Your pilgrimage, one small step at a time." />
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
              ? "Your tree is waiting for its first small step."
              : returning
                ? `${tree.totalActions} meaningful steps have shaped it.`
                : treeReturnLine}
          </p>

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
            <p className="mb-2.5 text-[0.75rem] uppercase tracking-[0.16em] text-olive-500">
              Markers
            </p>
            <div className="flex flex-wrap gap-2.5">
              {earned.map((e) => {
                const m = seedMilestones.find((x) => x.key === e.key);
                if (!m) return null;
                return (
                  <span
                    key={e.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 px-3 py-1.5 text-[0.8125rem] text-gold-700"
                  >
                    <PixelIcon name={(m.iconKey as PixelSpriteName) ?? "star"} size={3} />
                    {m.title}
                  </span>
                );
              })}
              {nextMilestones.map((m) => (
                <span
                  key={m.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-linen px-3 py-1.5 text-[0.8125rem] text-fog"
                >
                  <PixelIcon name={(m.iconKey as PixelSpriteName) ?? "star"} size={3} />
                  {m.title}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Timeline */}
        <section className="mt-7 pb-6">
          <p className="mb-3 text-[0.75rem] uppercase tracking-[0.16em] text-olive-500">
            The road so far
          </p>
          {timeline.length === 0 ? (
            <p className="py-8 text-center text-[0.9375rem] text-ash">
              {emptyStates.journey}
            </p>
          ) : (
            <ol className="relative ml-2 border-l border-mist">
              {timeline.map((e) => (
                <li key={e.id} className="relative ml-6 pb-6 last:pb-0">
                  <span className="absolute -left-[2.05rem] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-parchment ring-1 ring-mist">
                    <PixelIcon name={EVENT_SPRITE[e.type]} size={3} />
                  </span>
                  <p className="text-[0.9375rem] text-charcoal">{e.title}</p>
                  <p className="mt-0.5 text-[0.75rem] text-fog">
                    {formatShortDate(e.occurredAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
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
