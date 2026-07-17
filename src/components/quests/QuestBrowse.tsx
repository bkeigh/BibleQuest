"use client";

/**
 * Quest discovery and rolling-pick surface. Suggestions are deterministic for
 * a given day and profile; the three-window free limit lives in QuestOS.
 */
import { useEffect, useMemo, useState } from "react";
import { seedQuests, questBySlug } from "@/data/seed/quests";
import {
  activeQuestAssignments,
  filterQuests,
  formatQuestWindowRemaining,
  nextQuestSlotAt,
  occupiedQuestAssignments,
  QUEST_PICK_UNDO_MS,
  questSlotsRemaining,
  selectSuggestedQuests,
} from "@/lib/questos/quest-engine";
import { getCurrentSeason } from "@/lib/questos/seasonal-engine";
import {
  useQuestOS,
  selectMyQuests,
} from "@/lib/questos/store";
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
import {
  IconPlus,
  IconClose,
  IconBookmark,
} from "@/components/design-system/icons";
import { useStrings } from "@/lib/i18n";
import { toDateKey } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { usePlus } from "@/lib/revenuecat/usePlus";
import { QuestGenerator } from "@/components/quests/QuestGenerator";

const DURATIONS: QuestDuration[] = [5, 10, 15, 30, 60, 240, 480];

const ENERGY_LEVELS: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "Low energy" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function ShelfTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent">
      {children}
    </h2>
  );
}

function QuestBrowseInner() {
  const { toast } = useToast();
  const t = useStrings();
  const pickQuest = useQuestOS((s) => s.pickQuest);
  const unpickQuest = useQuestOS((s) => s.unpickQuest);
  const saveQuestForLater = useQuestOS((s) => s.saveQuestForLater);
  const assignments = useQuestOS((s) => s.assignments);
  const myQuests = useQuestOS(selectMyQuests);
  const completions = useQuestOS((s) => s.completions);
  const profile = useQuestOS((s) => s.profile);
  const settings = useQuestOS((s) => s.settings);
  const { isPlus } = usePlus();

  // Rolling windows can expire without another store write. Refresh the
  // projection gently so a freed slot appears while this page is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const picks = useMemo(
    () => activeQuestAssignments(assignments, now),
    [assignments, now]
  );

  const [duration, setDuration] = useState<QuestDuration | null>(null);
  const [category, setCategory] = useState<QuestCategory | null>(null);
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [company, setCompany] = useState<"solo" | "social" | null>(null);
  const [setting, setSetting] = useState<"indoor" | "outdoor" | null>(null);
  const [search, setSearch] = useState("");
  const resultKey = [duration, category, energy, company, setting, search].join("|");
  const [pagination, setPagination] = useState({ key: resultKey, count: 24 });
  const visibleCount = pagination.key === resultKey ? pagination.count : 24;

  const slotsRemaining = questSlotsRemaining(assignments, isPlus, now);
  const nextSlot = nextQuestSlotAt(assignments, isPlus, now);
  const reservedSlots = occupiedQuestAssignments(assignments, now).length;

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
  const pickedBySlug = useMemo(
    () => new Map(picks.map((assignment) => [assignment.questSlug, assignment])),
    [picks]
  );
  const activePicks = picks.filter((pick) => pick.status === "started");
  const readyPicks = picks.filter((pick) => pick.status === "assigned");
  const donePicks = picks.filter((pick) => pick.status === "completed");
  const pickGroups = [
    { key: "active", label: "Active quests", items: activePicks },
    { key: "ready", label: "Ready to begin", items: readyPicks },
    { key: "done", label: "Completed", items: donePicks },
  ].filter((group) => group.items.length > 0);

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
    if (pickQuest(quest.slug, isPlus)) {
      toast(t.quests.added, { variant: "success" });
    } else {
      toast(
        nextSlot
          ? `Your next slot opens in ${formatQuestWindowRemaining(nextSlot, now).replace(" left", "")}.`
          : t.quests.capReached
      );
    }
  }

  function handleRemove(quest: QuestTemplate) {
    const pick = picks.find((assignment) => assignment.questSlug === quest.slug);
    const trueUndo =
      pick?.status === "assigned" &&
      now - Date.parse(pick.pickedAt) <= QUEST_PICK_UNDO_MS;
    unpickQuest(quest.slug, isPlus);
    toast(
      isPlus || trueUndo
        ? t.quests.removed
        : "Removed from your list. This slot resets when its 24-hour window ends."
    );
  }

  function handleSave(quest: QuestTemplate) {
    if (saveQuestForLater(quest.slug)) {
      toast(t.myQuests.savedToast, { variant: "success" });
    }
  }

  /** A browse-list slip: shelf state + add-to-today / save-for-later. */
  function browseSlip(quest: QuestTemplate, compact = false) {
    const done = completedToday.has(quest.slug);
    const assignment = pickedBySlug.get(quest.slug);
    const isPicked = Boolean(assignment);
    const shelfStatus = myQuests[quest.slug]?.status;
    const isSaved = shelfStatus === "saved" || shelfStatus === "paused";
    // Saving makes sense only for quests not already underway or done.
    const canSave = !isPicked && !done && !shelfStatus;
    return (
      <QuestSlip
        key={quest.slug}
        quest={quest}
        href={`/app/quests/${quest.slug}`}
        assignmentStatus={assignment?.status}
        completed={done}
        saved={!isPicked && !done && isSaved}
        compact={compact}
        action={
          !isPicked && !done ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                aria-label={t.quests.addToToday}
                title={t.quests.addToToday}
                onClick={() => handleAdd(quest)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/50 bg-paper text-accent transition-colors duration-300 hover:bg-accent-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <IconPlus size={17} />
              </button>
              {canSave && !compact && (
                <button
                  type="button"
                  aria-label={t.myQuests.saveForLater}
                  title={t.myQuests.saveForLater}
                  onClick={() => handleSave(quest)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-mist bg-paper text-ash transition-colors duration-300 hover:border-accent/40 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <IconBookmark size={16} />
                </button>
              )}
            </div>
          ) : undefined
        }
      />
    );
  }

  const hasFilters = activeFilterCount > 0;

  return (
    <>
      <PageHeader
        title={t.nav.quests}
        subtitle={
          isPlus
            ? "Choose freely. Plus gives you unlimited active quest windows."
            : "Choose up to three quests at a time. Each window stays open for 24 hours."
        }
      />
      <PageContainer>
        {/* Today's visible rolling windows, pinned above discovery. */}
        <section aria-label="Today's picks">
          <div className="flex items-baseline justify-between">
            <ShelfTitle>{t.quests.today}</ShelfTitle>
            <p aria-live="polite" className="text-caption text-ash">
              {isPlus
                ? `${activePicks.length} active · ${readyPicks.length} ready · Unlimited`
                : `${activePicks.length} active · ${readyPicks.length} ready${
                    donePicks.length > 0 ? ` · ${donePicks.length} done` : ""
                  } · ${reservedSlots}/3 slots${
                    Number.isFinite(slotsRemaining) && slotsRemaining > 0
                      ? ` · ${slotsRemaining} open`
                      : ""
                  }`}
            </p>
          </div>
          {picks.length === 0 ? (
            <PaperCard variant="quiet" padding="sm" className="mt-2">
              <p className="text-small text-charcoal">
                {reservedSlots > 0
                  ? `${reservedSlots} removed ${reservedSlots === 1 ? "quest still holds a slot" : "quests still hold their slots"} until the 24-hour reset. You can restore ${reservedSlots === 1 ? "it" : "them"} from Browse.`
                  : t.empty.questsUnpicked}
              </p>
            </PaperCard>
          ) : (
            <div className="mt-3 space-y-4">
              {pickGroups.map((group) => (
                <div key={group.key}>
                  <h3 className="mb-2 text-caption uppercase tracking-[0.16em] text-ash">
                    {group.label}
                  </h3>
                  <div className="space-y-3">
                    {group.items.map((pick) => {
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
                          assignmentStatus={pick.status}
                          completed={done}
                          expiresAt={pick.expiresAt}
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
                </div>
              ))}
            </div>
          )}
        </section>

        <Disclosure
          label="Generate a quest"
          variant="card"
          defaultOpen={false}
          summary={
            isPlus ? (
              <span className="rounded-full bg-accent-surface px-2 py-0.5 text-caption text-accent">
                Plus
              </span>
            ) : undefined
          }
          className="mt-6"
        >
          <QuestGenerator isPlus={isPlus} onAdd={handleAdd} />
        </Disclosure>

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
                {t.quests.search}
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

            <FilterGroup label={t.quests.duration}>
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

            <FilterGroup label={t.quests.category}>
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

            <FilterGroup label={t.quests.energy}>
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

            <FilterGroup label={t.quests.soloOrSocial}>
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

            <FilterGroup label={t.quests.indoorOrOutdoor}>
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

        {/* Suggested for today — the old daily scorer, now an offer.
            Compact slips: the shelf invites, the quest page tells the story. */}
        {!hasFilters && suggested.length > 0 && (
          <section className="mt-6" aria-label={t.quests.suggested}>
            <ShelfTitle>{t.quests.suggested}</ShelfTitle>
            <div className="mt-2 space-y-3">
              {suggested.map((quest) => browseSlip(quest, true))}
            </div>
          </section>
        )}

        {/* Seasonal shelf */}
        {seasonal.length > 0 && !hasFilters && (
          <section className="mt-6" aria-label={`For ${season.label}`}>
            <ShelfTitle>For {season.label}</ShelfTitle>
            <div className="mt-2 space-y-3">
              {seasonal.map((quest) => browseSlip(quest))}
            </div>
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
            <div className="space-y-3 pb-6">
              {results.slice(0, visibleCount).map((quest) => browseSlip(quest))}
              {visibleCount < results.length && (
                <button
                  type="button"
                  onClick={() =>
                    setPagination({ key: resultKey, count: visibleCount + 24 })
                  }
                  className="mx-auto block rounded-full border border-mist bg-paper px-5 py-2.5 text-small font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent-surface"
                >
                  Show 24 more · {results.length - visibleCount} remaining
                </button>
              )}
            </div>
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
