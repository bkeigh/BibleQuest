import { advanceStreak } from "./streak-engine";
import {
  JOURNEY_EVENT_TYPES,
  MEANINGFUL_JOURNEY_EVENT_TYPES,
  emptyStreak,
  type JourneyEvent,
  type JourneyEventType,
  type Prayer,
  type QuestCompletion,
  type Reflection,
  type StreakState,
  type VerseBookmark,
} from "./types";
import {
  daysBetween,
  isValidDateKey,
  isValidZonedTimestamp,
} from "@/lib/utils/dates";

const journeyTypes = new Set<string>(JOURNEY_EVENT_TYPES);
const meaningfulTypes = new Set<JourneyEventType>(
  MEANINGFUL_JOURNEY_EVENT_TYPES
);

/** Validate a completion before it can influence milestones or sync. */
export function isValidQuestCompletion(value: unknown): value is QuestCompletion {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const completion = value as Record<string, unknown>;
  return (
    typeof completion.id === "string" &&
    completion.id.length > 0 &&
    typeof completion.questSlug === "string" &&
    completion.questSlug.length > 0 &&
    isValidDateKey(completion.dateKey) &&
    isValidZonedTimestamp(completion.completedAt) &&
    (completion.reflectionId === undefined ||
      (typeof completion.reflectionId === "string" &&
        completion.reflectionId.length > 0))
  );
}

/** Validate durable Journey history before UI, streak, or milestone use. */
export function isValidJourneyEvent(value: unknown): value is JourneyEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  if (
    typeof event.id !== "string" ||
    event.id.length === 0 ||
    typeof event.type !== "string" ||
    !journeyTypes.has(event.type) ||
    typeof event.title !== "string" ||
    event.title.length === 0 ||
    !isValidDateKey(event.dateKey) ||
    !isValidZonedTimestamp(event.occurredAt) ||
    (event.detail !== undefined && typeof event.detail !== "string") ||
    (event.sourceId !== undefined &&
      (typeof event.sourceId !== "string" || event.sourceId.length === 0))
  ) {
    return false;
  }

  // A source-local day can differ from the timestamp's UTC day by one day.
  return Math.abs(daysBetween(event.occurredAt.slice(0, 10), event.dateKey)) <= 1;
}

/** Keep the first valid occurrence of every durable record id. */
function uniqueValidById<T extends { id: string }>(
  values: readonly unknown[],
  guard: (value: unknown) => value is T
): T[] {
  const seen = new Set<string>();
  const clean: T[] = [];
  for (const value of values) {
    if (!guard(value) || seen.has(value.id)) continue;
    seen.add(value.id);
    clean.push(value);
  }
  return clean;
}

export function uniqueValidJourneyEvents(values: readonly unknown[]): JourneyEvent[] {
  const seenSources = new Set<string>();
  const sourceClean = uniqueValidById(values, isValidJourneyEvent).filter((event) => {
    if (!event.sourceId) return true;
    const key = `${event.type}:${event.sourceId}`;
    if (seenSources.has(key)) return false;
    seenSources.add(key);
    return true;
  });
  const linkedFingerprints = new Set(
    sourceClean
      .filter((event) => event.sourceId)
      .map(
        (event) =>
          `${event.type}|${event.occurredAt}|${event.title}|${event.detail ?? ""}`
      )
  );
  return sourceClean.filter(
    (event) =>
      event.sourceId ||
      !linkedFingerprints.has(
        `${event.type}|${event.occurredAt}|${event.title}|${event.detail ?? ""}`
      )
  );
}

export function uniqueValidQuestCompletions(
  values: readonly unknown[]
): QuestCompletion[] {
  return uniqueValidById(values, isValidQuestCompletion);
}

interface CurrentJourneyRecords {
  prayers: Prayer[];
  reflections: Reflection[];
  bookmarks: VerseBookmark[];
  journeyEvents: JourneyEvent[];
}

interface SourceDescriptor {
  sourceId: string;
  type: JourneyEventType;
  title: string;
  detail?: string;
  occurredAt: string;
}

/** Stable passage identity ignores edition, matching milestone semantics. */
export function bookmarkJourneySourceId(
  bookmark: Pick<VerseBookmark, "bookSlug" | "chapter" | "verse">
): string {
  return `bookmark:${bookmark.bookSlug}:${bookmark.chapter}:${bookmark.verse}`;
}

/** Attach stable sources to legacy events and backfill missing current records. */
export function ensureCurrentJourneyEvents(
  input: CurrentJourneyRecords,
  createId: () => string
): JourneyEvent[] {
  const events = uniqueValidJourneyEvents(input.journeyEvents).map((event) => ({
    ...event,
  }));
  const descriptors: SourceDescriptor[] = [];
  const seenSources = new Set<string>();
  const add = (descriptor: SourceDescriptor) => {
    if (seenSources.has(descriptor.sourceId)) return;
    seenSources.add(descriptor.sourceId);
    descriptors.push(descriptor);
  };

  for (const prayer of input.prayers) {
    add({
      sourceId: `prayer:${prayer.id}`,
      type: "prayer_created",
      title: "Prayer written",
      occurredAt: prayer.createdAt,
    });
    if (prayer.status === "answered" && prayer.answeredAt) {
      add({
        sourceId: `prayer-answer:${prayer.id}`,
        type: "prayer_answered",
        title: "Prayer answered",
        occurredAt: prayer.answeredAt,
      });
    }
  }
  for (const reflection of input.reflections) {
    add({
      sourceId: `reflection:${reflection.id}`,
      type: "reflection_written",
      title: "Reflection written",
      occurredAt: reflection.createdAt,
    });
  }
  for (const bookmark of input.bookmarks) {
    add({
      sourceId: bookmarkJourneySourceId(bookmark),
      type: "verse_bookmarked",
      title: "Verse saved",
      detail: `${bookmark.bookName} ${bookmark.chapter}:${bookmark.verse}`,
      occurredAt: bookmark.createdAt,
    });
  }

  const claimedLegacy = new Set<number>();
  for (const descriptor of descriptors) {
    if (
      events.some(
        (event) =>
          event.type === descriptor.type && event.sourceId === descriptor.sourceId
      )
    ) {
      continue;
    }
    const targetTime = Date.parse(descriptor.occurredAt);
    const legacyIndex = events.findIndex(
      (event, index) =>
        !claimedLegacy.has(index) &&
        !event.sourceId &&
        event.type === descriptor.type &&
        Math.abs(Date.parse(event.occurredAt) - targetTime) <= 5_000
    );
    if (legacyIndex >= 0) {
      events[legacyIndex] = { ...events[legacyIndex], sourceId: descriptor.sourceId };
      claimedLegacy.add(legacyIndex);
      continue;
    }
    if (!isValidZonedTimestamp(descriptor.occurredAt)) continue;
    events.push({
      id: createId(),
      type: descriptor.type,
      title: descriptor.title,
      detail: descriptor.detail,
      sourceId: descriptor.sourceId,
      // Legacy records did not preserve their source timezone. UTC is stable
      // across devices and avoids inventing a different day on every sync.
      dateKey: descriptor.occurredAt.slice(0, 10),
      occurredAt: descriptor.occurredAt,
    });
  }
  return events;
}

/** Rebuild the candle from truthful meaningful days, repairing old bookmarks. */
export function rebuildStreakFromJourneyEvents(
  values: readonly unknown[]
): StreakState {
  const days = [
    ...new Set(
      uniqueValidJourneyEvents(values)
        .filter((event) => meaningfulTypes.has(event.type))
        .map((event) => event.dateKey)
    ),
  ].sort();
  return days.reduce(
    (streak, dateKey) => advanceStreak(streak, dateKey),
    emptyStreak()
  );
}
