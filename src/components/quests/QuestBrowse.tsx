"use client";

import { useMemo, useState } from "react";
import { seedQuests, questBySlug } from "@/data/seed/quests";
import { filterQuests, selectSuggestedQuests } from "@/lib/questos/quest-engine";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { useQuestOS, selectTodayPicks } from "@/lib/questos/store";
import {
  QUEST_CATEGORIES,
  type EnergyLevel,
  type QuestCategory,
  type QuestDuration,
  type QuestTemplate,
} from "@/lib/questos/types";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import {
  QuestSlip,
  formatDuration,
  CATEGORY_LABEL,
} from "@/components/quests/QuestSlip";
import { Disclosure } from "@/components/design-system/Disclosure";
import { PaperCard } from "@/components/design-system/PaperCard";
import { useToast } from "@/components/design-system/Toast";
import { IconPlus, IconClose } from "@/components/design-system/icons";
import { useStrings, fmt } from "@/lib/i18n";
import { toDateKey } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

// No 480-minute quests exist in the seed catalog, so that tier stays off
// the filter row until content ships for it.
const DURATIONS: QuestDuration[] = [5, 10, 15, 30, 60, 240];

const ENERGY_LEVELS: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "Low energy" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function ShelfTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-pixel text-[1rem] text-accent">{children}</p>
  );
}

function QuestBrowseInner() {
  const { toast } = useToast();
  const t = useStrings();
  const pickQuest = useQuestOS((s) => s.pickQuest);
  const unpickQuest = useQuestOS((s) => s.unpickQuest);
  const picks = useQuestOS(selectTodayPicks);
  const completions = useQuestOS((s) => s.completions);
  const profile = useQuestOS((s) => s.profile);
  const settings = useQuestOS((s) => s.settings);

  const [duration, setDuration] = useState<QuestDuration | null>(null);
  const [category, setCategory] = useState<QuestCategory | null>(null);
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [company, setCompany] = useState<"solo" | "social" | null>(null);
  const [setting, setSetting] = useState<"indoor" | "outdoor" | null>(null);
  const [search, setSearch] = useState("");

  const season = useMemo(() => getCurrentSeason(), []);
  const todayKey = toDateKey();

  const completedToday = useMemo(
    () =>
      new Set(
        completions
          .filter((c) => c.dateKey === todayKey)
          .map((c) => c.questSlug)
      ),
    [completions, todayKey]
  );
  const pickedSlugs = useMemo(
    () => new Set(picks.map((a) => a.questSlug)),
    [picks]
  );

  const activeFilterCount =
    (duration ? 1 : 0) +
    (category ? 1 : 0) +
    (energy ? 1 : 0) +
    (company ? 1 : 0) +
    (setting ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const results = useMemo(
    () =>
      filterQuests(
        seedQuests.filter((q) => !q.isPremium),
        {
          durations: duration ? [duration] : undefined,
          categories: category ? [category] : undefined,
          energy: energy ? [energy] : undefined,
          soloOrSocial: company ?? undefined,
          indoorOrOutdoor: setting ?? undefined,
          search: search.trim() || undefined,
        }
      ),
    [duration, category, energy, company, setting, search]
  );

  const suggested = useMemo(
    () =>
      selectSuggestedQuests({
        quests: seedQuests,
        dateKey: todayKey,
        profile,
        settings,
        season: season.key,
        recentSlugs: completions.map((c) => c.questSlug),
        excludeSlugs: [
          ...picks.map((a) => a.questSlug),
          ...completedToday,
        ],
        count: 3,
      }),
    [todayKey, profile, settings, season.key, completions, picks, completedToday]
  );

  const seasonal = useMemo(
    () =>
      season.key !== "ordinary_time"
        ? seedQuests.filter((q) => q.seasonTags.includes(season.key)).slice(0, 3)
        : [],
    [season.key]
  );

  function handleAdd(quest: QuestTemplate) {
    if (pickQuest(quest.slug)) {
      toast(t.quests.added, { variant: "success" });
    } else {
      toast(t.quests.capReached);
    }
  }

  function handleRemove(quest: QuestTemplate) {
    unpickQuest(quest.slug);
    toast(t.quests.removed);
  }

  /** A browse-list slip: picked/done state + an add-to-today control. */
  function browseSlip(quest: QuestTemplate) {
    const done = completedToday.has(quest.slug);
    const isPicked = pickedSlugs.has(quest.slug);
    return (
      <QuestSlip
        key={quest.slug}
        quest={quest}
        href={`/app/quests/${quest.slug}`}
        picked={isPicked}
        completed={done}
        action={
          !isPicked && !done ? (
            <button
              type="button"
              aria-label="Add to today"
              title="Add to today"
              onClick={() => handleAdd(quest)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/50 bg-paper text-accent transition-colors duration-300 hover:bg-accent-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconPlus size={17} />
            </button>
          ) : undefined
        }
      />
    );
  }

  const hasFilters = activeFilterCount > 0;

  return (
    <>
      <PageHeader
        title="Quests"
        subtitle="Small acts of faith. Pick up to three a day."
      />
      <PageContainer>
        {/* Today's picks — the day you chose, pinned above everything */}
        <section aria-label="Today's picks">
          <div className="flex items-baseline justify-between">
            <ShelfTitle>{t.quests.today}</ShelfTitle>
            {picks.length > 0 && (
              <p aria-live="polite" className="text-caption text-ash">
                {fmt(t.quests.picked, { n: picks.length })}
              </p>
            )}
          </div>
          {picks.length === 0 ? (
            <PaperCard variant="quiet" padding="sm" className="mt-2">
              <p className="text-small text-charcoal">
                {t.empty.questsUnpicked}
              </p>
            </PaperCard>
          ) : (
            <div className="mt-2 space-y-3">
              {picks.map((pick) => {
                const quest = questBySlug.get(pick.questSlug);
                if (!quest) return null;
                const done =
                  pick.status === "completed" ||
                  completedToday.has(pick.questSlug);
                return (
                  <QuestSlip
                    key={pick.questSlug}
                    quest={quest}
                    href={`/app/quests/${quest.slug}`}
                    completed={done}
                    action={
                      done ? undefined : (
                        <button
                          type="button"
                          aria-label={`Remove ${quest.title} from today`}
                          title="Remove from today"
                          onClick={() => handleRemove(quest)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-mist bg-paper text-ash transition-colors duration-300 hover:border-accent/40 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <IconClose size={16} />
                        </button>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Filters — collapsed by default so browsing stays calm */}
        <Disclosure
          label={t.quests.filters}
          variant="card"
          defaultOpen={false}
          count={hasFilters ? activeFilterCount : undefined}
          className="mt-6"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="quest-search"
                className="text-caption font-medium text-ash"
              >
                Search
              </label>
              <input
                id="quest-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, theme, or category"
                className="mt-1.5 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-body text-graphite outline-none transition-colors focus:border-accent/50"
              />
            </div>

            <FilterGroup label="Time">
              <Chip active={duration === null} onClick={() => setDuration(null)} small>
                Any time
              </Chip>
              {DURATIONS.map((d) => (
                <Chip
                  key={d}
                  small
                  active={duration === d}
                  onClick={() => setDuration(duration === d ? null : d)}
                >
                  {formatDuration(d)}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Category">
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
            </FilterGroup>

            <FilterGroup label="Energy">
              <Chip active={energy === null} onClick={() => setEnergy(null)} small>
                Any
              </Chip>
              {ENERGY_LEVELS.map((e) => (
                <Chip
                  key={e.value}
                  small
                  active={energy === e.value}
                  onClick={() => setEnergy(energy === e.value ? null : e.value)}
                >
                  {e.label}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Company">
              <Chip active={company === null} onClick={() => setCompany(null)} small>
                Either
              </Chip>
              <Chip
                small
                active={company === "solo"}
                onClick={() => setCompany(company === "solo" ? null : "solo")}
              >
                On your own
              </Chip>
              <Chip
                small
                active={company === "social"}
                onClick={() => setCompany(company === "social" ? null : "social")}
              >
                With others
              </Chip>
            </FilterGroup>

            <FilterGroup label="Setting">
              <Chip active={setting === null} onClick={() => setSetting(null)} small>
                Anywhere
              </Chip>
              <Chip
                small
                active={setting === "indoor"}
                onClick={() => setSetting(setting === "indoor" ? null : "indoor")}
              >
                Indoors
              </Chip>
              <Chip
                small
                active={setting === "outdoor"}
                onClick={() => setSetting(setting === "outdoor" ? null : "outdoor")}
              >
                Outdoors
              </Chip>
            </FilterGroup>
          </div>
        </Disclosure>

        {/* Suggested for today — the old daily scorer, now an offer */}
        {!hasFilters && suggested.length > 0 && (
          <section className="mt-6" aria-label={t.quests.suggested}>
            <ShelfTitle>{t.quests.suggested}</ShelfTitle>
            <div className="mt-2 space-y-3">{suggested.map(browseSlip)}</div>
          </section>
        )}

        {/* Seasonal shelf */}
        {seasonal.length > 0 && !hasFilters && (
          <section className="mt-6" aria-label={`For ${season.label}`}>
            <ShelfTitle>For {season.label}</ShelfTitle>
            <div className="mt-2 space-y-3">{seasonal.map(browseSlip)}</div>
          </section>
        )}

        {/* Results */}
        <section className="mt-6" aria-label="All quests">
          <p className="mb-3 text-small text-ash" aria-live="polite">
            {results.length} {results.length === 1 ? "quest" : "quests"}
          </p>
          {results.length === 0 ? (
            <p className="py-10 text-center text-small text-ash">
              {t.empty.questsFiltered}
            </p>
          ) : (
            <div className="space-y-3 pb-6">{results.map(browseSlip)}</div>
          )}
        </section>
      </PageContainer>
    </>
  );
}

export function QuestBrowse() {
  return (
    <ClientOnly>
      <QuestBrowseInner />
    </ClientOnly>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-caption font-medium text-ash">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">{children}</div>
    </div>
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
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border transition-all duration-300",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        small ? "px-3 py-1.5 text-[0.8125rem]" : "px-4 py-2 text-[0.875rem]",
        active
          ? "border-accent bg-accent-surface text-accent-ink"
          : "border-mist bg-paper text-ash hover:border-accent/40 hover:text-charcoal"
      )}
    >
      {children}
    </button>
  );
}
