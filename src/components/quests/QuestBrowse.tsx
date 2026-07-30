"use client";

/**
 * Canonical Quest board and discovery surface. Ready, Active, and Completed
 * cards share one flow; suggestions remain deterministic for the local day.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { seedQuests, questBySlug } from "@/data/seed/quests";
import {
  activeQuestAssignments,
  filterQuests,
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
import { QuestBoardCard } from "@/components/quests/QuestBoardCard";
import { QuestBoardSection } from "@/components/quests/QuestBoardSection";
import { QuestCompletionSheet } from "@/components/quests/QuestCompletionSheet";
import { Disclosure } from "@/components/design-system/Disclosure";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { SearchClearButton } from "@/components/design-system/SearchClearButton";
import { useToast } from "@/components/design-system/Toast";
import {
  IconPlus,
  IconBookmark,
} from "@/components/design-system/icons";
import { useStrings } from "@/lib/i18n";
import { toDateKey } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { usePlus } from "@/lib/billing/usePlus";
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
  const saveQuestForLater = useQuestOS((s) => s.saveQuestForLater);
  const assignments = useQuestOS((s) => s.assignments);
  const myQuests = useQuestOS(selectMyQuests);
  const completions = useQuestOS((s) => s.completions);
  const profile = useQuestOS((s) => s.profile);
  const settings = useQuestOS((s) => s.settings);
  const { isPlus } = usePlus();

  // Rolling windows can expire without another store write. Refresh the
  // projection gently so countdown and Resume states stay accurate.
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

  // Derive daily and seasonal discovery from the minute-refreshed clock so a
  // long-lived PWA rolls over without requiring a reload or route change.
  const today = new Date(now);
  const season = getCurrentSeason(today);
  const todayKey = toDateKey(today);

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
  const completedQuests = useMemo(() => {
    const seen = new Set<string>();
    return completions
      .filter((completion) => completion.dateKey === todayKey)
      .toReversed()
      .flatMap((completion) => {
        if (seen.has(completion.questSlug)) return [];
        seen.add(completion.questSlug);
        const quest = questBySlug.get(completion.questSlug);
        return quest ? [quest] : [];
      });
  }, [completions, todayKey]);
  const [openSections, setOpenSections] = useState({
    active: activePicks.length > 0,
    ready: activePicks.length === 0,
    completed: false,
  });
  const [completedQuest, setCompletedQuest] =
    useState<QuestTemplate | null>(null);
  const [boardAnnouncement, setBoardAnnouncement] = useState("");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

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
      setOpenSections((current) => ({ ...current, ready: true }));
      setBoardAnnouncement(`${quest.title} moved to Ready.`);
      toast("Added to Ready.", { variant: "success" });
    } else {
      toast("All three quest spots are filled. Finish or remove one first.");
    }
  }

  function handleSave(quest: QuestTemplate) {
    if (saveQuestForLater(quest.slug)) {
      toast(t.myQuests.savedToast, { variant: "success" });
    }
  }

  // Return discovery to its broad, predictable starting state in one action.
  function clearFilters() {
    setDuration(null);
    setCategory(null);
    setEnergy(null);
    setCompany(null);
    setSetting(null);
    setSearch("");
  }

  /** A browse-list slip: shelf state plus Add to Ready or Save for later. */
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
                aria-label="Add to Ready"
                title="Add to Ready"
                onClick={() => handleAdd(quest)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/50 bg-paper text-accent transition-colors duration-300 hover:bg-accent-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <IconPlus size={17} />
              </button>
              {canSave && !compact && (
                <button
                  type="button"
                  aria-label={t.myQuests.saveForLater}
                  title={t.myQuests.saveForLater}
                  onClick={() => handleSave(quest)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-mist bg-paper text-ash transition-colors duration-300 hover:border-accent/40 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
  // Keeps touch-screen status copy useful by omitting noisy zero counts and
  // naming remaining capacity directly instead of showing slot arithmetic.
  const todayStatusSummary = [
    activePicks.length > 0 ? `${activePicks.length} active` : null,
    readyPicks.length > 0 ? `${readyPicks.length} ready` : null,
    completedQuests.length > 0 ? `${completedQuests.length} complete` : null,
    isPlus
      ? "Unlimited spots"
      : Number.isFinite(slotsRemaining)
        ? `${slotsRemaining} ${slotsRemaining === 1 ? "spot" : "spots"} open`
        : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join(" · ");

  /** Keeps the destination section open and restores focus after card motion. */
  function handleTransition(
    quest: QuestTemplate,
    destination: "ready" | "active" | "completed",
  ) {
    setNow(Date.now());
    setOpenSections((current) => ({ ...current, [destination]: true }));
    setBoardAnnouncement(`${quest.title} moved to ${destination}.`);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-quest-card="${quest.slug}"]`)
          ?.focus({ preventScroll: true });
      });
    });
  }

  /** Closes the sheet and focuses the card that just entered Completed. */
  const closeCompletionSheet = useCallback(() => {
    setCompletedQuest((current) => {
      const slug = current?.slug;
      if (slug) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>(`[data-quest-card="${slug}"]`)
              ?.focus({ preventScroll: true });
          });
        });
      }
      return null;
    });
  }, [setCompletedQuest]);

  return (
    <>
      <PageHeader
        title={t.nav.quests}
        subtitle={
          isPlus
            ? "Keep any number of quests Ready or Active. The 24-hour timer starts when you begin."
            : "Keep up to three quests Ready or Active. The 24-hour timer starts when you begin."
        }
      />
      <PageContainer>
        {/* The board is the one canonical lifecycle surface above discovery. */}
        <section aria-label="Your quest board">
          <div className="flex items-baseline justify-between">
            <ShelfTitle>Your quests</ShelfTitle>
            <p aria-live="polite" className="text-caption text-ash">
              {todayStatusSummary}
            </p>
          </div>
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            {boardAnnouncement}
          </p>

          <div className="mt-3 space-y-3">
              <QuestBoardSection
                label="Active"
                count={activePicks.length}
                open={openSections.active}
                onOpenChange={(open) =>
                  setOpenSections((current) => ({
                    ...current,
                    active: open,
                  }))
                }
                emptyBody="No quest is underway right now."
              >
                {/* Native grid gaps stay stable while Safari reflows moved cards. */}
                <ul data-quest-board-list className="grid gap-3">
                  {activePicks.flatMap((assignment) => {
                    const quest = questBySlug.get(assignment.questSlug);
                    return quest ? (
                      <QuestBoardCard
                        key={quest.slug}
                        quest={quest}
                        assignment={assignment}
                        state="active"
                        now={now}
                        open={expandedSlug === quest.slug}
                        onOpenChange={(open) =>
                          setExpandedSlug(open ? quest.slug : null)
                        }
                        onTransition={handleTransition}
                        onCompleted={setCompletedQuest}
                      />
                    ) : (
                      []
                    );
                  })}
                </ul>
              </QuestBoardSection>

              <QuestBoardSection
                label="Ready"
                count={readyPicks.length}
                open={openSections.ready}
                onOpenChange={(open) =>
                  setOpenSections((current) => ({ ...current, ready: open }))
                }
                emptyBody="Choose a quest below when you want a place to begin."
              >
                <ul data-quest-board-list className="grid gap-3">
                  {readyPicks.flatMap((assignment) => {
                    const quest = questBySlug.get(assignment.questSlug);
                    return quest ? (
                      <QuestBoardCard
                        key={quest.slug}
                        quest={quest}
                        assignment={assignment}
                        state="ready"
                        now={now}
                        open={expandedSlug === quest.slug}
                        onOpenChange={(open) =>
                          setExpandedSlug(open ? quest.slug : null)
                        }
                        onTransition={handleTransition}
                        onCompleted={setCompletedQuest}
                      />
                    ) : (
                      []
                    );
                  })}
                </ul>
              </QuestBoardSection>

              <QuestBoardSection
                label="Completed today"
                count={completedQuests.length}
                open={openSections.completed}
                onOpenChange={(open) =>
                  setOpenSections((current) => ({
                    ...current,
                    completed: open,
                  }))
                }
                emptyBody="Completed quests will gather here for today."
              >
                <ul data-quest-board-list className="grid gap-3">
                  {completedQuests.map((quest) => (
                    <QuestBoardCard
                      key={quest.slug}
                      quest={quest}
                      state="completed"
                      now={now}
                      open={expandedSlug === quest.slug}
                      onOpenChange={(open) =>
                        setExpandedSlug(open ? quest.slug : null)
                      }
                      onTransition={handleTransition}
                      onCompleted={setCompletedQuest}
                    />
                  ))}
                </ul>
              </QuestBoardSection>
          </div>
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
          contentClassName="pt-4"
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
              <div className="relative mt-1.5">
                <input
                  id="quest-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Title, theme, or category"
                  className="w-full rounded-[var(--radius-button)] border border-mist bg-linen py-2.5 pl-3.5 pr-12 text-body text-graphite outline-none transition-colors focus:border-accent/50"
                />
                <SearchClearButton
                  inputId="quest-search"
                  visible={search.length > 0}
                  onClear={() => setSearch("")}
                  label="Clear quest search"
                />
              </div>
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
            <PaperCard variant="quiet" padding="lg" className="text-center">
              <p className="font-display text-[1.125rem] text-graphite">
                No quests match yet
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-small leading-relaxed text-ash">
                {t.empty.questsFiltered} Clear the filters to return to the full
                quest collection.
              </p>
              <GentleButton
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="mt-4"
              >
                Clear all filters
              </GentleButton>
            </PaperCard>
          ) : (
            <div className="space-y-3 pb-6">
              {results.slice(0, visibleCount).map((quest) => browseSlip(quest))}
              {visibleCount < results.length && (
                <button
                  type="button"
                  onClick={() =>
                    setPagination({ key: resultKey, count: visibleCount + 24 })
                  }
                  className="mx-auto block min-h-11 rounded-full border border-mist bg-paper px-5 py-2.5 text-small font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent-surface"
                >
                  Show 24 more · {results.length - visibleCount} remaining
                </button>
              )}
            </div>
          )}
        </section>
      </PageContainer>
      <QuestCompletionSheet
        quest={completedQuest}
        onClose={closeCompletionSheet}
      />
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
        "min-h-11 min-w-11 shrink-0 whitespace-nowrap rounded-full border transition-all duration-300",
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
