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
import {
  PRAYER_CATEGORIES,
  QUEST_STEP_KEYS,
  REFLECTION_MOODS,
  type AccountNudgeContext,
  type QuestOSSnapshot,
} from "./types";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number";
const PRAYER_CATEGORY_SET = new Set<string>(PRAYER_CATEGORIES);
const QUEST_STEP_SET = new Set<string>(QUEST_STEP_KEYS);
const REFLECTION_MOOD_SET = new Set<string>(REFLECTION_MOODS);
const MY_QUEST_STATUSES = new Set([
  "saved",
  "active",
  "paused",
  "completed",
  "archived",
]);
const ASSIGNMENT_STATUSES = new Set([
  "assigned",
  "started",
  "completed",
  "released",
]);
const PRAYER_STATUSES = new Set(["active", "answered", "archived"]);
const ACCOUNT_NUDGE_CONTEXTS = new Set<AccountNudgeContext>([
  "onboarding",
  "first_quest_completed",
  "first_reflection",
  "milestone_reached",
]);

// Element guards — assert the fields the app dereferences without a guard.
const isPrayer = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.body) && str(o.status) &&
  PRAYER_STATUSES.has(o.status) && str(o.category) &&
  PRAYER_CATEGORY_SET.has(o.category) && str(o.createdAt) && str(o.updatedAt);
const isReflection = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.body) && str(o.createdAt) && str(o.updatedAt) &&
  (o.mood === undefined || (str(o.mood) && REFLECTION_MOOD_SET.has(o.mood)));
const isGrowthEvent = (o: unknown) => isObj(o) && str(o.growthType) && num(o.amount);
const isCompletion = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.questSlug) && str(o.dateKey) && str(o.completedAt);
const isJourneyEvent = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.type) && str(o.title) && str(o.dateKey) && str(o.occurredAt);
const isBookmark = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.bookSlug) && str(o.bookName) && num(o.chapter) && num(o.verse) && str(o.text) && str(o.createdAt);
const isChapterRead = (o: unknown) => isObj(o) && str(o.bookSlug) && num(o.chapter) && str(o.dateKey);
const isRecentVerse = (o: unknown) =>
  isObj(o) &&
  str(o.bookSlug) &&
  str(o.bookName) &&
  num(o.chapter) &&
  num(o.verseStart) &&
  num(o.verseEnd) &&
  str(o.reference) &&
  str(o.text) &&
  str(o.viewedAt);
const isEarnedMilestone = (o: unknown) => isObj(o) && str(o.key) && str(o.achievedAt);
const isProfile = (o: unknown) =>
  isObj(o) && str(o.displayName) && typeof o.onboardingCompleted === "boolean" && str(o.createdAt);
const isReadingPosition = (o: unknown) =>
  isObj(o) && str(o.bookSlug) && str(o.bookName) && num(o.chapter);
const isAssignment = (o: unknown) =>
  isObj(o) && str(o.dateKey) && str(o.questSlug) && str(o.status) &&
  ASSIGNMENT_STATUSES.has(o.status) && num(o.rerolls) &&
  (o.pickedAt === undefined || str(o.pickedAt)) &&
  (o.expiresAt === undefined || str(o.expiresAt));
const isStreak = (o: unknown) =>
  isObj(o) && num(o.current) && num(o.longest) &&
  (str(o.lastActiveDateKey) || o.lastActiveDateKey === null);
const isMyQuest = (o: unknown) =>
  isObj(o) &&
  str(o.questSlug) &&
  str(o.status) &&
  MY_QUEST_STATUSES.has(o.status) &&
  str(o.addedAt) &&
  str(o.lastActivityAt) &&
  Array.isArray(o.stepsDone) &&
  o.stepsDone.every((step) => str(step) && QUEST_STEP_SET.has(step)) &&
  num(o.timesCompleted);
const isAccountNudge = (o: unknown) =>
  isObj(o) &&
  Array.isArray(o.shownContexts) &&
  o.shownContexts.every(
    (context) => str(context) && ACCOUNT_NUDGE_CONTEXTS.has(context as AccountNudgeContext)
  ) &&
  (str(o.lastDismissedAt) || o.lastDismissedAt === null) &&
  num(o.dismissCount);

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
  recentVerses: isRecentVerse,
};

const ALL_KEYS: string[] = [
  ...Object.keys(ARRAY_GUARDS),
  "pendingMilestones",
  "settings",
  "assignments",
  "myQuests",
  "profile",
  "readingPosition",
  "lastVisitDateKey",
  "streak",
  "accountNudge",
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
  // Assignments: per-day picked quests. Accept BOTH shapes — new exports
  // hold arrays, pre-pick-model exports hold a single assignment object —
  // and normalize everything to arrays so old backups still restore.
  if (isObj(src.assignments)) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src.assignments)) {
      if (Array.isArray(v)) {
        const picks = v.filter(isAssignment);
        if (picks.length || v.length === 0) clean[k] = picks;
      } else if (isAssignment(v)) {
        clean[k] = [v];
      }
    }
    out.assignments = clean;
  }
  // Quest shelf: keyed by slug. Validate each entry individually — rather than
  // requiring the whole object well-formed — so one corrupted entry can't
  // discard the rest of the shelf. A present-but-invalid entry is dropped; a
  // genuinely ABSENT field (pre-v6 export) is left unset so store.ts's
  // importData falls back to deriving the shelf from history, exactly as
  // before. Previously this field was silently dropped entirely, forcing
  // every restore through that fallback and discarding real saved/paused/
  // archived entries and in-progress steps.
  if (isObj(src.myQuests)) {
    const clean: Record<string, unknown> = {};
    for (const [slug, entry] of Object.entries(src.myQuests)) {
      if (isMyQuest(entry)) clean[slug] = entry;
    }
    out.myQuests = clean;
  }
  // Settings: pass through if an object (importData deep-merges over defaults);
  // drop a non-object appearance so the merge can't spread a primitive.
  // Consent is intentionally never restored from a file: importing a journey
  // is not an explicit choice to enable analytics on this browser.
  if (isObj(src.settings)) {
    const s = { ...src.settings };
    if ("appearance" in s && !isObj(s.appearance)) delete s.appearance;
    delete s.analyticsConsent;
    out.settings = s;
  }
  // Nullable objects: keep only when well-formed, else drop to the default (null).
  if (isProfile(src.profile)) out.profile = src.profile;
  if (isStreak(src.streak)) out.streak = src.streak;
  if (isReadingPosition(src.readingPosition)) out.readingPosition = src.readingPosition;
  if (isAccountNudge(src.accountNudge)) out.accountNudge = src.accountNudge;
  if (str(src.lastVisitDateKey) || src.lastVisitDateKey === null) {
    out.lastVisitDateKey = src.lastVisitDateKey;
  }

  return { ok: true, data: out as Partial<QuestOSSnapshot> };
}
