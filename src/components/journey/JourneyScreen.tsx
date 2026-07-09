"use client";

import { useMemo } from "react";
import { useQuestOS } from "@/lib/questos/store";
import { calculateTreeState } from "@/lib/questos/growth-engine";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { GrowthTree } from "@/components/journey/GrowthTree";
import { GROWTH_MEANINGS } from "@/lib/questos/growth-engine";
import { treeReturnLine, emptyStates } from "@/lib/questos/copy";
import { seedMilestones } from "@/data/seed/milestones";
import { formatShortDate } from "@/lib/utils/dates";
import { SeasonalAtmosphere } from "@/components/design-system/SeasonalAtmosphere";
import type {
  GrowthType,
  JourneyEvent,
  JourneyEventType,
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

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function JourneyScreenInner() {
  const growthEvents = useQuestOS((s) => s.growthEvents);
  const journeyEvents = useQuestOS((s) => s.journeyEvents);
  const earned = useQuestOS((s) => s.earnedMilestones);
  const lastVisit = useQuestOS((s) => s.lastVisitDateKey);

  const tree = useMemo(() => calculateTreeState(growthEvents), [growthEvents]);
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
            <p className="mb-2.5 text-[0.75rem] uppercase tracking-[0.16em] text-accent">
              Milestones
            </p>
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
        <section className="mt-7 pb-6">
          <p className="mb-3 text-[0.75rem] uppercase tracking-[0.16em] text-accent">
            The road so far
          </p>
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
