"use client";

import { useMemo, useState } from "react";
import { seedQuests } from "@/data/seed/quests";
import { filterQuests } from "@/lib/questos/quest-engine";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import {
  QUEST_CATEGORIES,
  type QuestCategory,
  type QuestDuration,
} from "@/lib/questos/types";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { QuestSlip, formatDuration } from "@/components/quests/QuestSlip";
import { emptyStates } from "@/lib/questos/copy";
import { cn } from "@/lib/utils/cn";

const DURATIONS: QuestDuration[] = [5, 10, 15, 30, 60, 240];

const CATEGORY_LABEL: Record<QuestCategory, string> = {
  prayer: "Prayer",
  scripture: "Scripture",
  service: "Service",
  kindness: "Kindness",
  forgiveness: "Forgiveness",
  generosity: "Generosity",
  discipline: "Discipline",
  gratitude: "Gratitude",
  silence: "Silence",
  worship: "Worship",
  family: "Family",
  community: "Community",
  reflection: "Reflection",
  patience: "Patience",
};

export function QuestBrowse() {
  const [duration, setDuration] = useState<QuestDuration | null>(null);
  const [category, setCategory] = useState<QuestCategory | null>(null);

  const season = useMemo(() => getCurrentSeason(), []);

  const results = useMemo(
    () =>
      filterQuests(seedQuests, {
        durations: duration ? [duration] : undefined,
        categories: category ? [category] : undefined,
      }),
    [duration, category]
  );

  const seasonal = useMemo(
    () =>
      season.key !== "ordinary_time"
        ? seedQuests.filter((q) => q.seasonTags.includes(season.key)).slice(0, 3)
        : [],
    [season.key]
  );

  return (
    <>
      <PageHeader
        title="Quests"
        subtitle="Small, meaningful ways to live today’s faith."
      />
      <PageContainer>
        {/* Duration filter — horizontally scrollable */}
        <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
          <Chip active={duration === null} onClick={() => setDuration(null)}>
            Any time
          </Chip>
          {DURATIONS.map((d) => (
            <Chip
              key={d}
              active={duration === d}
              onClick={() => setDuration(duration === d ? null : d)}
            >
              {formatDuration(d)}
            </Chip>
          ))}
        </div>

        {/* Category filter */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Chip active={category === null} onClick={() => setCategory(null)} small>
            All
          </Chip>
          {QUEST_CATEGORIES.map((c) => (
            <Chip
              key={c}
              small
              active={category === c}
              onClick={() => setCategory(category === c ? null : c)}
            >
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>

        {/* Seasonal shelf */}
        {seasonal.length > 0 && !duration && !category && (
          <section className="mt-6">
            <p className="mb-2 text-[0.75rem] uppercase tracking-[0.16em] text-olive-500">
              For {season.label}
            </p>
            <div className="space-y-3">
              {seasonal.map((q) => (
                <QuestSlip key={q.slug} quest={q} href={`/app/quests/${q.slug}`} />
              ))}
            </div>
          </section>
        )}

        {/* Results */}
        <section className="mt-6">
          <p className="mb-3 text-[0.875rem] text-ash">
            {results.length} {results.length === 1 ? "quest" : "quests"}
          </p>
          {results.length === 0 ? (
            <p className="py-10 text-center text-[0.9375rem] text-ash">
              {emptyStates.questsFiltered}
            </p>
          ) : (
            <div className="space-y-3 pb-6">
              {results.map((q) => (
                <QuestSlip key={q.slug} quest={q} href={`/app/quests/${q.slug}`} />
              ))}
            </div>
          )}
        </section>
      </PageContainer>
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border transition-all duration-300",
        small ? "px-3 py-1.5 text-[0.8125rem]" : "px-4 py-2 text-[0.875rem]",
        active
          ? "border-olive-500 bg-olive-50 text-olive-700"
          : "border-mist bg-paper text-ash hover:border-olive-300 hover:text-charcoal"
      )}
    >
      {children}
    </button>
  );
}
