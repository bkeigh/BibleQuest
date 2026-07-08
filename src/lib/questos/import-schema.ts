/**
 * Import validation for a previously-exported journey.
 *
 * Reject files that clearly aren't a BibleQuest export, but be forgiving about
 * detail so a backup from a slightly different app version still restores. We
 * validate the KIND of each top-level field AND the minimal shape of each array
 * element that downstream code accesses unguarded (sort keys, growth reducers,
 * etc.), dropping anything malformed so it can't crash a render after import.
 *
 * PRIVACY: this never logs the file and never echoes any of its contents in an
 * error message — prayer & reflection text must not leave the device.
 */
import type { QuestOSSnapshot } from "./types";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number";

// Element guards — assert the fields the app dereferences without a guard.
const isPrayer = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.body) && str(o.status) && str(o.category) && str(o.createdAt) && str(o.updatedAt);
const isReflection = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.body) && str(o.createdAt) && str(o.updatedAt);
const isGrowthEvent = (o: unknown) => isObj(o) && str(o.growthType) && num(o.amount);
const isCompletion = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.questSlug) && str(o.dateKey) && str(o.completedAt);
const isJourneyEvent = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.type) && str(o.title) && str(o.dateKey) && str(o.occurredAt);
const isBookmark = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.bookSlug) && str(o.bookName) && num(o.chapter) && num(o.verse) && str(o.text) && str(o.createdAt);
const isChapterRead = (o: unknown) => isObj(o) && str(o.bookSlug) && num(o.chapter) && str(o.dateKey);
const isEarnedMilestone = (o: unknown) => isObj(o) && str(o.key) && str(o.achievedAt);
const isProfile = (o: unknown) =>
  isObj(o) && str(o.displayName) && typeof o.onboardingCompleted === "boolean" && str(o.createdAt);
const isReadingPosition = (o: unknown) =>
  isObj(o) && str(o.bookSlug) && str(o.bookName) && num(o.chapter);
const isAssignment = (o: unknown) => isObj(o) && str(o.dateKey) && str(o.questSlug) && str(o.status);

// field name -> element guard. Elements failing the guard are dropped.
const ARRAY_GUARDS: Record<string, (o: unknown) => boolean> = {
  completions: isCompletion,
  prayers: isPrayer,
  reflections: isReflection,
  journeyEvents: isJourneyEvent,
  growthEvents: isGrowthEvent,
  earnedMilestones: isEarnedMilestone,
  bookmarks: isBookmark,
  chaptersRead: isChapterRead,
};

const ALL_KEYS: string[] = [
  ...Object.keys(ARRAY_GUARDS),
  "pendingMilestones",
  "settings",
  "assignments",
  "profile",
  "readingPosition",
  "lastVisitDateKey",
];

export type ParseResult =
  | { ok: true; data: Partial<QuestOSSnapshot> }
  | { ok: false; error: string };

/**
 * Parse an untrusted JSON string into a sanitized snapshot. Returns a friendly,
 * content-free error on failure.
 */
export function parseSnapshot(rawText: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "That file isn’t valid JSON." };
  }
  if (!isObj(json)) {
    return { ok: false, error: "That doesn’t look like a BibleQuest journey." };
  }
  // Require at least one recognized data key so we don't accept arbitrary {}.
  if (!ALL_KEYS.some((k) => k in json)) {
    return { ok: false, error: "That doesn’t look like a BibleQuest journey." };
  }

  const src = json;
  const out: Record<string, unknown> = {};

  // Object arrays: keep only well-formed elements.
  for (const [key, guard] of Object.entries(ARRAY_GUARDS)) {
    const v = src[key];
    if (Array.isArray(v)) out[key] = v.filter(guard);
  }
  // String arrays.
  if (Array.isArray(src.pendingMilestones)) {
    out.pendingMilestones = src.pendingMilestones.filter(str);
  }
  // Assignments: a record of well-formed assignments.
  if (isObj(src.assignments)) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src.assignments)) {
      if (isAssignment(v)) clean[k] = v;
    }
    out.assignments = clean;
  }
  // Settings: pass through if an object (importData deep-merges over defaults);
  // drop a non-object appearance so the merge can't spread a primitive.
  if (isObj(src.settings)) {
    const s = { ...src.settings };
    if ("appearance" in s && !isObj(s.appearance)) delete s.appearance;
    out.settings = s;
  }
  // Nullable objects: keep only when well-formed, else drop to the default (null).
  if (isProfile(src.profile)) out.profile = src.profile;
  if (isReadingPosition(src.readingPosition)) out.readingPosition = src.readingPosition;
  if (str(src.lastVisitDateKey) || src.lastVisitDateKey === null) {
    out.lastVisitDateKey = src.lastVisitDateKey;
  }

  return { ok: true, data: out as Partial<QuestOSSnapshot> };
}
