/**
 * Pure, privacy-preserving journal projections.
 *
 * Prayer and reflection records intentionally remain separate persisted
 * shapes. This module only derives a shared view for the Prayer Journal UI;
 * it never writes, logs, or sends the entry text it receives.
 */
import type {
  Prayer,
  PrayerCategory,
  PrayerStatus,
  Reflection,
  ReflectionMood,
} from "@/lib/questos/types";
import { daysBetween, fromDateKey, toDateKey } from "@/lib/utils/dates";

export const JOURNAL_FILTERS = [
  "all",
  "prayers",
  "reflections",
  "active",
  "answered",
  "archived",
] as const;

export type JournalFilter = (typeof JOURNAL_FILTERS)[number];
export type JournalSort = "entry-date" | "last-updated";

interface JournalEntryBase {
  /** Stable across a mixed prayer/reflection list. */
  key: `prayer:${string}` | `reflection:${string}`;
  id: string;
  title: string;
  body: string;
  excerpt: string;
  /** The journal-entry date; deliberately distinct from the edit timestamp. */
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  /** Local calendar day used by the date-grouped journal timeline. */
  dateKey: string;
}

export interface JournalPrayerEntry extends JournalEntryBase {
  kind: "prayer";
  key: `prayer:${string}`;
  entry: Prayer;
  category: PrayerCategory;
  status: PrayerStatus;
  archivedAt?: string;
  answeredAt?: string;
  answerReflection?: string;
}

export interface JournalReflectionEntry extends JournalEntryBase {
  kind: "reflection";
  key: `reflection:${string}`;
  entry: Reflection;
  prompt?: string;
  mood?: ReflectionMood;
  relatedQuestSlug?: string;
  relatedVerseReference?: string;
  archivedAt?: string;
}

export type JournalEntry = JournalPrayerEntry | JournalReflectionEntry;

export interface JournalDateGroup {
  key: string;
  dateKey: string;
  label: string;
  entries: JournalEntry[];
}

export interface JournalTimelineOptions {
  filter?: JournalFilter;
  query?: string;
  sort?: JournalSort;
  now?: Date;
  locale?: string;
}

export interface JournalTimeline {
  entries: JournalEntry[];
  groups: JournalDateGroup[];
  /** Counts ignore the active search/filter so filter controls stay stable. */
  counts: Record<JournalFilter, number>;
}

const DEFAULT_EXCERPT_LENGTH = 180;

/** Collapse layout whitespace and produce a compact, Unicode-safe card preview. */
export function journalExcerpt(
  body: string,
  maxLength = DEFAULT_EXCERPT_LENGTH,
): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (maxLength <= 0 || !compact) return "";

  const characters = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(compact)]
    .map(({ segment }) => segment);
  if (characters.length <= maxLength) return compact;
  if (maxLength === 1) return "…";

  return `${characters.slice(0, maxLength - 1).join("").trimEnd()}…`;
}

function safeDateKey(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? toDateKey(date) : "unknown";
}

function prayerTitle(prayer: Prayer): string {
  const title = prayer.title?.trim();
  if (title) return title;
  return prayer.status === "answered" ? "Answered prayer" : "Prayer";
}

function reflectionTitle(reflection: Reflection): string {
  return reflection.relatedVerseReference
    ? `Reflection on ${reflection.relatedVerseReference}`
    : "Reflection";
}

/** Convert persisted records into one discriminated, presentation-safe list. */
export function toJournalEntries(
  prayers: readonly Prayer[],
  reflections: readonly Reflection[],
): JournalEntry[] {
  return [
    ...prayers.map<JournalPrayerEntry>((prayer) => ({
      kind: "prayer",
      key: `prayer:${prayer.id}`,
      entry: prayer,
      id: prayer.id,
      title: prayerTitle(prayer),
      body: prayer.body,
      excerpt: journalExcerpt(prayer.body),
      category: prayer.category,
      status: prayer.status,
      archivedAt:
        prayer.archivedAt ??
        (prayer.status === "archived" ? prayer.updatedAt : undefined),
      answeredAt: prayer.answeredAt,
      answerReflection: prayer.answerReflection,
      occurredAt: prayer.createdAt,
      createdAt: prayer.createdAt,
      updatedAt: prayer.updatedAt,
      dateKey: safeDateKey(prayer.createdAt),
    })),
    ...reflections.map<JournalReflectionEntry>((reflection) => ({
      kind: "reflection",
      key: `reflection:${reflection.id}`,
      entry: reflection,
      id: reflection.id,
      title: reflectionTitle(reflection),
      body: reflection.body,
      excerpt: journalExcerpt(reflection.body),
      prompt: reflection.prompt,
      mood: reflection.mood,
      relatedQuestSlug: reflection.relatedQuestSlug,
      relatedVerseReference: reflection.relatedVerseReference,
      archivedAt: reflection.archivedAt,
      occurredAt: reflection.createdAt,
      createdAt: reflection.createdAt,
      updatedAt: reflection.updatedAt,
      dateKey: safeDateKey(reflection.createdAt),
    })),
  ];
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function searchHaystack(entry: JournalEntry): string {
  if (entry.kind === "prayer") {
    return normalizeSearch(
      [
        entry.title,
        entry.body,
        entry.category,
        entry.status,
        entry.answerReflection,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return normalizeSearch(
    [
      entry.title,
      entry.body,
      entry.prompt,
      entry.mood,
      entry.relatedQuestSlug,
      entry.relatedVerseReference,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function matchesFilter(entry: JournalEntry, filter: JournalFilter): boolean {
  const archived = Boolean(entry.archivedAt);
  switch (filter) {
    case "all":
      return !archived;
    case "prayers":
      return entry.kind === "prayer" && !archived;
    case "reflections":
      return entry.kind === "reflection" && !archived;
    case "active":
    case "answered":
      return entry.kind === "prayer" && !archived && entry.status === filter;
    case "archived":
      return archived;
  }
}

function timestamp(iso: string): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

export function filterJournalEntries(
  entries: readonly JournalEntry[],
  options: Pick<JournalTimelineOptions, "filter" | "query" | "sort"> = {},
): JournalEntry[] {
  const filter = options.filter ?? "all";
  const tokens = normalizeSearch(options.query ?? "").split(" ").filter(Boolean);
  const sortField = options.sort === "last-updated" ? "updatedAt" : "createdAt";

  return entries
    .filter((entry) => matchesFilter(entry, filter))
    .filter((entry) => {
      if (!tokens.length) return true;
      const haystack = searchHaystack(entry);
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((a, b) => {
      const byDate = timestamp(b[sortField]) - timestamp(a[sortField]);
      return byDate || a.key.localeCompare(b.key);
    });
}

function journalDateLabel(
  dateKey: string,
  now: Date,
  locale: string,
): string {
  if (dateKey === "unknown") return "Date unavailable";

  const todayKey = toDateKey(now);
  const age = daysBetween(dateKey, todayKey);
  if (age === 0) return "Today";
  if (age === 1) return "Yesterday";

  const date = fromDateKey(dateKey);
  return date.toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function groupJournalEntriesByDate(
  entries: readonly JournalEntry[],
  options: Pick<JournalTimelineOptions, "now" | "locale"> = {},
): JournalDateGroup[] {
  const now = options.now ?? new Date();
  const locale = options.locale ?? "en-US";
  const groups = new Map<string, JournalEntry[]>();

  for (const entry of entries) {
    const group = groups.get(entry.dateKey);
    if (group) group.push(entry);
    else groups.set(entry.dateKey, [entry]);
  }

  return [...groups].map(([dateKey, groupEntries]) => ({
    key: dateKey,
    dateKey,
    label: journalDateLabel(dateKey, now, locale),
    entries: groupEntries,
  }));
}

function journalCounts(
  entries: readonly JournalEntry[],
): Record<JournalFilter, number> {
  const currentEntries = entries.filter((entry) => !entry.archivedAt);
  const prayers = currentEntries.filter(
    (entry): entry is JournalPrayerEntry => entry.kind === "prayer",
  );
  return {
    all: currentEntries.length,
    prayers: prayers.length,
    reflections: currentEntries.length - prayers.length,
    active: prayers.filter((entry) => entry.status === "active").length,
    answered: prayers.filter((entry) => entry.status === "answered").length,
    archived: entries.filter((entry) => Boolean(entry.archivedAt)).length,
  };
}

/** Build the complete mixed journal view in one deterministic pass. */
export function deriveJournalTimeline(
  prayers: readonly Prayer[],
  reflections: readonly Reflection[],
  options: JournalTimelineOptions = {},
): JournalTimeline {
  const allEntries = toJournalEntries(prayers, reflections);
  const entries = filterJournalEntries(allEntries, options);
  return {
    entries,
    groups: groupJournalEntriesByDate(entries, options),
    counts: journalCounts(allEntries),
  };
}
