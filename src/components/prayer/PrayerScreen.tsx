"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { ArtMascot } from "@/components/design-system/ArtMascot";
import { SearchClearButton } from "@/components/design-system/SearchClearButton";
import { JournalEntryBody } from "@/components/journal/JournalEntryBody";
import { JournalPrivacyNote } from "@/components/journal/JournalPrivacyNote";
import { JournalComposeMenu } from "@/components/journal/JournalComposeMenu";
import { ReflectionCard } from "@/components/reflection/ReflectionCard";
import { PRAYER_CATEGORY_LABEL } from "@/lib/questos/prayer-presentation";
import {
  IconEye,
  IconEyeOff,
  IconPlus,
  IconSearch,
} from "@/components/design-system/icons";
import { expander } from "@/lib/motion";
import { formatShortDate, hashString } from "@/lib/utils/dates";
import { useCurrentDayKey } from "@/lib/use-current-day-key";
import { reflectionPrompts } from "@/data/seed/reflection-prompts";
import {
  deriveJournalTimeline,
  type JournalEntry,
  type JournalFilter,
} from "@/lib/questos/journal";
import type { Prayer, PrayerStatus } from "@/lib/questos/types";
import { cn } from "@/lib/utils/cn";

const PRIMARY_FILTERS: Array<{ value: JournalFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "prayers", label: "Prayers" },
  { value: "reflections", label: "Reflections" },
];

const SECONDARY_FILTERS: Array<{ value: JournalFilter; label: string }> = [
  { value: "answered", label: "Answered" },
  { value: "archived", label: "Archived" },
];

function PrayerScreenInner() {
  const pathname = usePathname();
  const dayKey = useCurrentDayKey();
  const prayers = useQuestOS((state) => state.prayers);
  const reflections = useQuestOS((state) => state.reflections);
  const [filter, setFilter] = useState<JournalFilter>(() =>
    pathname === "/app/prayer/reflections" ? "reflections" : "all",
  );
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [entriesHidden, setEntriesHidden] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeComposeMenu = useCallback(() => setComposeOpen(false), []);
  const hideJournal = useCallback(() => {
    setComposeOpen(false);
    setSearchOpen(false);
    setQuery("");
    setEntriesHidden(true);
  }, []);

  const prompt = useMemo(
    () => reflectionPrompts[hashString(dayKey) % reflectionPrompts.length],
    [dayKey],
  );
  const timeline = useMemo(
    () => deriveJournalTimeline(prayers, reflections, { filter, query }),
    [filter, prayers, query, reflections],
  );
  const visibleCount = timeline.groups.reduce(
    (count, group) => count + group.entries.length,
    0,
  );
  const totalCount = prayers.length + reflections.length;

  useEffect(() => {
    function hideWhenBackgrounded() {
      if (document.visibilityState === "hidden") hideJournal();
    }
    document.addEventListener("visibilitychange", hideWhenBackgrounded);
    return () =>
      document.removeEventListener("visibilitychange", hideWhenBackgrounded);
  }, [hideJournal]);

  function revealSearch() {
    setSearchOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  return (
    <>
      <div
        aria-hidden={composeOpen ? true : undefined}
        inert={composeOpen ? true : undefined}
      >
        <PageHeader
          title="Prayer Journal"
          subtitle="Prayers, reflections, and what you want to remember."
          action={
            <GentleButton
              variant="primary"
              size="sm"
              onClick={() => setComposeOpen(true)}
              aria-haspopup="dialog"
            >
              <IconPlus size={17} /> New
            </GentleButton>
          }
        />
        <PageContainer className="pb-6">
        <JournalPrivacyNote />

        {!entriesHidden && (
        <div>
        <div className="mt-4 flex items-center gap-2">
          <div role="group" aria-label="Filter journal entries" className="min-w-0 flex-1">
            <div className="grid grid-cols-3 gap-1 rounded-full border border-mist bg-linen p-1">
              {PRIMARY_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    "min-h-11 rounded-full px-1 text-[0.8125rem] transition-all",
                    filter === item.value
                      ? "bg-paper font-medium text-graphite paper-shadow"
                      : "text-ash hover:text-charcoal",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-label={searchOpen ? "Close journal search" : "Search journal"}
            aria-expanded={searchOpen}
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false);
                setQuery("");
              } else {
                revealSearch();
              }
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mist bg-paper text-ash hover:text-graphite"
          >
            <IconSearch />
          </button>
          <button
            type="button"
            aria-label="Hide journal entries"
            aria-pressed="false"
            onClick={hideJournal}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mist bg-paper text-ash hover:text-graphite"
          >
            <IconEyeOff />
          </button>
        </div>

        {(timeline.counts.answered > 0 || timeline.counts.archived > 0) && (
          <div
            role="group"
            aria-label="Prayer status filters"
            className="mt-2 flex flex-wrap gap-2 px-1"
          >
            {SECONDARY_FILTERS.map((item) => {
              const count = timeline.counts[item.value];
              if (!count) return null;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() =>
                    setFilter((current) =>
                      current === item.value ? "all" : item.value,
                    )
                  }
                  className={cn(
                    "min-h-11 rounded-full border px-3 text-[0.8125rem] transition-colors",
                    filter === item.value
                      ? "border-accent bg-accent-surface font-medium text-accent"
                      : "border-mist bg-paper text-ash hover:border-accent/50 hover:text-charcoal",
                  )}
                >
                  {item.label} <span className="tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <AnimatePresence initial={false}>
          {searchOpen && (
            <motion.div
              variants={expander}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="overflow-hidden"
            >
              <div className="relative mt-3">
                <IconSearch
                  size={18}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-quill"
                />
                <label htmlFor="journal-search" className="sr-only">
                  Search prayers and reflections
                </label>
                <input
                  ref={searchRef}
                  id="journal-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search your journal"
                  autoComplete="off"
                  className="h-12 w-full rounded-[var(--radius-button)] border border-mist bg-paper pl-10 pr-12 text-[0.9375rem] text-graphite outline-none placeholder:text-quill focus:border-accent"
                />
                <SearchClearButton
                  inputId="journal-search"
                  visible={query.length > 0}
                  onClear={() => setQuery("")}
                  label="Clear journal search"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="sr-only" aria-live="polite">
          {visibleCount} {visibleCount === 1 ? "entry" : "entries"} shown
        </p>
        </div>
        )}

        {entriesHidden ? (
          <HiddenJournal onReveal={() => setEntriesHidden(false)} />
        ) : totalCount === 0 ? (
          <EmptyJournal prompt={prompt} onNew={() => setComposeOpen(true)} />
        ) : visibleCount === 0 ? (
          <EmptyResults
            query={query}
            onClear={() => {
              setQuery("");
              setFilter("all");
            }}
          />
        ) : (
          <div className="mt-6 space-y-7">
            {timeline.groups.map((group) => (
              <section key={group.key} aria-labelledby={`journal-day-${group.key}`}>
                <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
                  <h2
                    id={`journal-day-${group.key}`}
                    className="font-display text-[1.125rem] text-graphite"
                  >
                    {group.label}
                  </h2>
                  <span className="text-[0.75rem] tabular-nums text-ash">
                    {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                  </span>
                </div>
                <div className="space-y-3">
                  {group.entries.map((entry) => (
                    <JournalCard key={entry.key} entry={entry} />
                  ))}
                </div>
              </section>
            ))}

            <PaperCard variant="quiet" padding="sm" className="text-center">
              <p className="text-[0.875rem] text-ash">
                A few honest lines are enough.
              </p>
              <GentleButton
                variant="text"
                size="sm"
                className="mt-1 min-h-11"
                onClick={() => setComposeOpen(true)}
              >
                <IconPlus size={16} /> New entry
              </GentleButton>
            </PaperCard>
          </div>
        )}
        </PageContainer>
      </div>

      <JournalComposeMenu
        open={composeOpen}
        onClose={closeComposeMenu}
        prompt={prompt}
      />
    </>
  );
}

function JournalCard({ entry }: { entry: JournalEntry }) {
  return entry.kind === "prayer" ? (
    <PrayerCard prayer={entry.entry} />
  ) : (
    <ReflectionCard reflection={entry.entry} showDate={false} />
  );
}

function HiddenJournal({ onReveal }: { onReveal: () => void }) {
  return (
    <PaperCard variant="atmospheric" padding="lg" className="mt-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-linen ring-1 ring-mist">
        <IconEyeOff size={24} className="text-accent" />
      </div>
      <h2 className="mt-4 font-display text-[1.25rem] text-graphite">
        Your entries are hidden
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-[0.875rem] leading-relaxed text-ash">
        BibleQuest obscures this journal whenever the app leaves the foreground.
        This privacy screen does not encrypt browser storage.
      </p>
      <GentleButton variant="primary" size="md" className="mt-5" onClick={onReveal}>
        <IconEye size={18} /> Show my entries
      </GentleButton>
    </PaperCard>
  );
}

function EmptyJournal({
  prompt,
  onNew,
}: {
  prompt: { id: string; text: string };
  onNew: () => void;
}) {
  return (
    <div className="mt-6 space-y-3">
      <PaperCard variant="atmospheric" padding="lg" className="text-center">
        <ArtMascot name="dove" size={192} className="mb-4" />
        <h2 className="font-display text-[1.25rem] text-graphite">
          Make space for what matters
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[0.9375rem] leading-relaxed text-ash">
          Pray honestly, reflect on Scripture, and return to what you want to
          remember.
        </p>
        <GentleButton variant="primary" size="md" className="mt-5" onClick={onNew}>
          <IconPlus size={17} /> Write your first entry
        </GentleButton>
      </PaperCard>
      <PaperCard variant="quiet" padding="md">
        <p className="text-[0.75rem] uppercase tracking-[0.12em] text-gilt">
          A prompt for today
        </p>
        <p className="mt-1.5 font-display text-[1.0625rem] leading-snug text-graphite">
          {prompt.text}
        </p>
        <GentleLink
          variant="text"
          size="sm"
          className="mt-2 min-h-11"
          href={`/app/prayer/reflection/new?prompt=${encodeURIComponent(prompt.id)}`}
        >
          Write about this
        </GentleLink>
      </PaperCard>
    </div>
  );
}

function EmptyResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <PaperCard variant="quiet" padding="lg" className="mt-6 text-center">
      <ArtIcon name="leaf" size={92} />
      <h2 className="mt-3 font-display text-[1.125rem] text-graphite">
        No entries here
      </h2>
      <p className="mt-1 text-[0.875rem] leading-relaxed text-ash">
        {query.trim()
          ? "Try a different search or look across your whole journal."
          : "Choose another filter to return to your journal."}
      </p>
      <GentleButton variant="outline" size="sm" className="mt-4" onClick={onClear}>
        Clear filters
      </GentleButton>
    </PaperCard>
  );
}

const STATUS_ICON: Record<PrayerStatus, "candle" | "flower" | "leaf"> = {
  active: "candle",
  answered: "flower",
  archived: "leaf",
};

function CardAction({
  onClick,
  tone = "accent",
  children,
}: {
  onClick: () => void;
  tone?: "accent" | "ash" | "rose";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 text-[0.875rem] transition-colors",
        tone === "accent" && "text-accent hover:text-accent/80",
        tone === "ash" && "text-ash hover:text-charcoal",
        tone === "rose" && "text-ash hover:text-rose-700",
      )}
    >
      {children}
    </button>
  );
}

function PrayerCard({ prayer }: { prayer: Prayer }) {
  const { toast } = useToast();
  const markAnswered = useQuestOS((state) => state.markPrayerAnswered);
  const archivePrayer = useQuestOS((state) => state.archivePrayer);
  const unarchivePrayer = useQuestOS((state) => state.unarchivePrayer);
  const deletePrayer = useQuestOS((state) => state.deletePrayer);
  const [answering, setAnswering] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const noteId = `prayer-note-${prayer.id}`;
  const longEntry = prayer.body.length > 300 || prayer.body.split("\n").length > 6;
  const archived = Boolean(prayer.archivedAt) || prayer.status === "archived";
  const icon = archived ? "leaf" : STATUS_ICON[prayer.status];
  const showActions = !answering && !confirmingDelete;

  return (
    <PaperCard as="article" variant="paper" padding="md">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          <ArtIcon name={icon} size={48} />
        </span>
        <div className="min-w-0 flex-1">
          {prayer.title && (
            <h3 className="font-display text-[1.125rem] text-graphite">
              {prayer.title}
            </h3>
          )}
          <div
            className={cn(
              "relative mt-0.5",
              longEntry && !expanded && "max-h-36 overflow-hidden",
            )}
          >
            <JournalEntryBody className="text-[1rem] leading-relaxed text-charcoal">
              {prayer.body}
            </JournalEntryBody>
            {longEntry && !expanded && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-paper to-transparent"
              />
            )}
          </div>
          {longEntry && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="mt-1 min-h-11 text-[0.8125rem] font-medium text-accent"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}

          {prayer.status === "answered" && prayer.answerReflection && (
            <div className="mt-3 rounded-[var(--radius-button)] bg-gold-500/12 px-3.5 py-2.5">
              <p className="text-[0.75rem] uppercase tracking-wide text-gilt">
                How it was answered
              </p>
              <JournalEntryBody className="mt-1 text-[0.9375rem] text-charcoal">
                {prayer.answerReflection}
              </JournalEntryBody>
            </div>
          )}
          <p className="mt-2 text-[0.75rem] text-ash">
            {archived
              ? "Archived"
              : prayer.status === "answered" && prayer.answeredAt
                ? `Answered ${formatShortDate(prayer.answeredAt)}`
                : "Prayer"}
            {" · "}
            {PRAYER_CATEGORY_LABEL[prayer.category]}
          </p>

          {showActions && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4">
              {prayer.status === "active" && !archived && (
                <CardAction onClick={() => setAnswering(true)}>
                  Mark answered
                </CardAction>
              )}
              <Link
                href={`/app/prayer/new?edit=${prayer.id}`}
                className="inline-flex min-h-11 items-center text-[0.875rem] text-accent transition-colors hover:text-accent/80"
              >
                Edit
              </Link>
              {archived ? (
                <CardAction
                  onClick={() => {
                    unarchivePrayer(prayer.id);
                    toast("Prayer restored.");
                  }}
                >
                  Restore
                </CardAction>
              ) : (
                <CardAction
                  tone="ash"
                  onClick={() => {
                    archivePrayer(prayer.id);
                    toast("Prayer archived.", {
                      action: {
                        label: "Undo",
                        onClick: () => unarchivePrayer(prayer.id),
                      },
                    });
                  }}
                >
                  Archive
                </CardAction>
              )}
              <CardAction tone="rose" onClick={() => setConfirmingDelete(true)}>
                Delete
              </CardAction>
            </div>
          )}

          <AnimatePresence>
            {answering && (
              <motion.div
                variants={expander}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="overflow-hidden"
              >
                <div className="mt-3">
                  <label htmlFor={noteId} className="mb-2 block text-[0.875rem] text-charcoal">
                    How was this prayer answered? (optional)
                  </label>
                  <textarea
                    id={noteId}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="What happened?"
                    className="w-full resize-y rounded-[var(--radius-button)] border border-mist bg-linen px-3 py-2.5 text-[0.9375rem] outline-none focus:border-accent"
                  />
                  <div className="mt-2.5 flex gap-2">
                    <GentleButton
                      variant="gold"
                      size="sm"
                      onClick={() => {
                        markAnswered(prayer.id, note);
                        toast("Prayer marked answered.", { variant: "celebrate" });
                        setAnswering(false);
                      }}
                    >
                      Save answer
                    </GentleButton>
                    <GentleButton variant="ghost" size="sm" onClick={() => setAnswering(false)}>
                      Cancel
                    </GentleButton>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {confirmingDelete && (
              <motion.div
                variants={expander}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-[var(--radius-button)] bg-linen px-3.5 py-3">
                  <p className="text-[0.875rem] text-charcoal">
                    Permanently delete this prayer? This cannot be undone.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <GentleButton
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        deletePrayer(prayer.id);
                        toast("Prayer deleted.");
                      }}
                    >
                      Delete
                    </GentleButton>
                    <GentleButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Keep it
                    </GentleButton>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </PaperCard>
  );
}

export function PrayerScreen() {
  return (
    <ClientOnly>
      <PrayerScreenInner />
    </ClientOnly>
  );
}
