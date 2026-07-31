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
  QUEST_CATEGORIES,
  QUEST_DURATIONS,
  QUEST_STEP_KEYS,
  REFLECTION_MOODS,
  type AccountNudgeContext,
  type QuestOSSnapshot,
} from "./types";
import { seedMilestones } from "@/data/seed/milestones";
import { normalizeBibleTranslationKey } from "@/lib/bible/translations";
import { isWallpaperId } from "@/lib/wallpapers/catalog";
import {
  isValidGrowthEvent,
  uniqueValidGrowthEvents,
} from "./growth-engine";
import {
  isValidJourneyEvent,
  isValidQuestCompletion,
  uniqueValidJourneyEvents,
  uniqueValidQuestCompletions,
} from "./history-integrity";
import { isValidDateKey } from "@/lib/utils/dates";
import { normalizeGlassOpacity } from "@/lib/glass-opacity";
import { sanitizeGuidedProgress } from "@/lib/guided/progress";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number";
const PRAYER_CATEGORY_SET = new Set<string>(PRAYER_CATEGORIES);
const QUEST_CATEGORY_SET = new Set<unknown>(QUEST_CATEGORIES);
const QUEST_DURATION_SET = new Set<unknown>(QUEST_DURATIONS);
const QUEST_STEP_SET = new Set<string>(QUEST_STEP_KEYS);
const REFLECTION_MOOD_SET = new Set<string>(REFLECTION_MOODS);
const DAILY_RHYTHM_SET = new Set([
  "morning",
  "afternoon",
  "evening",
  "flexible",
]);
const MILESTONE_KEY_SET = new Set(seedMilestones.map(({ key }) => key));
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
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_COLLECTION_ITEMS = 20_000;
const MAX_IMPORT_KEYED_RECORDS = 5_000;
const IMPORT_TOO_LARGE_ERROR =
  "That journey is too large to restore safely.";

// Element guards — assert the fields the app dereferences without a guard.
const isPrayer = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.body) && str(o.status) &&
  PRAYER_STATUSES.has(o.status) && str(o.category) &&
  PRAYER_CATEGORY_SET.has(o.category) && str(o.createdAt) && str(o.updatedAt) &&
  (o.archivedAt === undefined || str(o.archivedAt));
const isReflection = (o: unknown) =>
  isObj(o) && str(o.id) && str(o.body) && str(o.createdAt) && str(o.updatedAt) &&
  (o.mood === undefined || (str(o.mood) && REFLECTION_MOOD_SET.has(o.mood))) &&
  (o.archivedAt === undefined || str(o.archivedAt));
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
const isProfile = (o: unknown): o is Record<string, unknown> =>
  isObj(o) && str(o.displayName) && typeof o.onboardingCompleted === "boolean" && str(o.createdAt);
const isReadingPosition = (o: unknown) =>
  isObj(o) && str(o.bookSlug) && str(o.bookName) && num(o.chapter);
const isAssignment = (o: unknown) =>
  isObj(o) && str(o.dateKey) && str(o.questSlug) && str(o.status) &&
  ASSIGNMENT_STATUSES.has(o.status) && num(o.rerolls) &&
  (o.pickedAt === undefined || str(o.pickedAt)) &&
  (o.expiresAt === undefined || str(o.expiresAt));
const isStreak = (o: unknown) =>
  isObj(o) && num(o.current) && Number.isSafeInteger(o.current) && o.current >= 0 &&
  num(o.longest) && Number.isSafeInteger(o.longest) && o.longest >= o.current &&
  (isValidDateKey(o.lastActiveDateKey) || o.lastActiveDateKey === null);
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
  completions: isValidQuestCompletion,
  prayers: isPrayer,
  reflections: isReflection,
  journeyEvents: isValidJourneyEvent,
  growthEvents: isValidGrowthEvent,
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
  "guidedProgress",
];

export type ParseResult =
  | { ok: true; data: Partial<QuestOSSnapshot> }
  | { ok: false; error: string };

/** Keep known pending milestones once, preserving their reveal order. */
function cleanPendingMilestones(values: unknown[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const value of values) {
    if (
      !str(value) ||
      !MILESTONE_KEY_SET.has(value) ||
      seen.has(value)
    ) {
      continue;
    }
    seen.add(value);
    clean.push(value);
  }
  return clean;
}

/**
 * Parse an untrusted JSON string into a sanitized snapshot. Returns a friendly,
 * content-free error on failure.
 */
export function parseSnapshot(rawText: string): ParseResult {
  // File input checks bytes before reading; this second bound protects every
  // direct caller without allocating another encoded copy of private text.
  if (rawText.length > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, error: IMPORT_TOO_LARGE_ERROR };
  }

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

  // Reject excessive collections instead of silently truncating a backup.
  for (const key of [...Object.keys(ARRAY_GUARDS), "pendingMilestones"]) {
    const value = src[key];
    if (Array.isArray(value) && value.length > MAX_IMPORT_COLLECTION_ITEMS) {
      return { ok: false, error: IMPORT_TOO_LARGE_ERROR };
    }
  }
  for (const key of ["assignments", "myQuests", "guidedProgress"]) {
    const value = src[key];
    if (
      isObj(value) &&
      Object.keys(value).length > MAX_IMPORT_KEYED_RECORDS
    ) {
      return { ok: false, error: IMPORT_TOO_LARGE_ERROR };
    }
  }
  if (
    isObj(src.assignments) &&
    Object.values(src.assignments).some(
      (value) =>
        Array.isArray(value) &&
        value.length > MAX_IMPORT_COLLECTION_ITEMS,
    )
  ) {
    return { ok: false, error: IMPORT_TOO_LARGE_ERROR };
  }

  // Object arrays: keep only well-formed elements.
  for (const [key, guard] of Object.entries(ARRAY_GUARDS)) {
    const v = src[key];
    if (Array.isArray(v)) {
      if (key === "completions") out[key] = uniqueValidQuestCompletions(v);
      else if (key === "journeyEvents") out[key] = uniqueValidJourneyEvents(v);
      else if (key === "growthEvents") out[key] = uniqueValidGrowthEvents(v);
      else out[key] = v.filter(guard);
    }
  }
  // Pending reveals only refer to the catalogue installed with this build.
  if (Array.isArray(src.pendingMilestones)) {
    out.pendingMilestones = cleanPendingMilestones(src.pendingMilestones);
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
    if ("appearance" in s && !isObj(s.appearance)) {
      delete s.appearance;
    } else if (isObj(s.appearance)) {
      const appearance = { ...s.appearance };

      // Wallpaper fields are device-local but may still ride through a manual
      // backup. Drop unknown identifiers and modes before the typed store sees them.
      if (
        appearance.wallpaperId !== "none" &&
        !isWallpaperId(appearance.wallpaperId)
      ) {
        delete appearance.wallpaperId;
      }
      if (
        appearance.wallpaperMode !== "still" &&
        appearance.wallpaperMode !== "live"
      ) {
        delete appearance.wallpaperMode;
      }
      if (typeof appearance.glassSurfaces !== "boolean") {
        delete appearance.glassSurfaces;
      }
      if (
        typeof appearance.myShepherdFloatingButton !== "boolean"
      ) {
        delete appearance.myShepherdFloatingButton;
      }
      // Keep valid backup preferences, but never let an imported file bypass
      // the same readability floor enforced by the Settings slider.
      if ("glassOpacity" in appearance) {
        if (
          typeof appearance.glassOpacity === "number" &&
          Number.isFinite(appearance.glassOpacity)
        ) {
          appearance.glassOpacity = normalizeGlassOpacity(
            appearance.glassOpacity,
          );
        } else {
          delete appearance.glassOpacity;
        }
      }
      s.appearance = appearance;
    }
    if ("preferredBibleTranslation" in s) {
      s.preferredBibleTranslation = normalizeBibleTranslationKey(
        s.preferredBibleTranslation,
      );
    }

    // Keep only notification fields the settings UI can safely dereference.
    if ("notifications" in s && !isObj(s.notifications)) {
      delete s.notifications;
    } else if (isObj(s.notifications)) {
      const notifications = { ...s.notifications };
      for (const key of [
        "dailyVerse",
        "dailyQuest",
        "prayerReminders",
        "weeklyRecap",
      ]) {
        if (typeof notifications[key] !== "boolean") delete notifications[key];
      }
      if (
        typeof notifications.preferredTime !== "string" ||
        !DAILY_RHYTHM_SET.has(notifications.preferredTime)
      ) {
        delete notifications.preferredTime;
      }
      s.notifications = notifications;
    }

    // Preference arrays must stay arrays because scoring and sync call array APIs.
    if ("questDurationPreference" in s) {
      s.questDurationPreference = Array.isArray(s.questDurationPreference)
        ? s.questDurationPreference.filter((value) =>
            QUEST_DURATION_SET.has(value),
          )
        : [];
    }
    if ("questCategoryPreference" in s) {
      s.questCategoryPreference = Array.isArray(s.questCategoryPreference)
        ? s.questCategoryPreference.filter((value) =>
            QUEST_CATEGORY_SET.has(value),
          )
        : [];
    }
    delete s.analyticsConsent;
    out.settings = s;
  }
  // Nullable objects: keep only when well-formed, else drop to the default (null).
  if (isProfile(src.profile)) {
    // Portable backups never import device cache or remote media pointers.
    const profile = { ...src.profile };
    delete profile.avatarVersion;
    delete profile.avatarUpdatedAt;
    out.profile = profile;
  }
  if (isStreak(src.streak)) out.streak = src.streak;
  if (isReadingPosition(src.readingPosition)) out.readingPosition = src.readingPosition;
  if (isAccountNudge(src.accountNudge)) out.accountNudge = src.accountNudge;
  if (isObj(src.guidedProgress)) {
    out.guidedProgress = sanitizeGuidedProgress(src.guidedProgress);
  }
  if (str(src.lastVisitDateKey) || src.lastVisitDateKey === null) {
    out.lastVisitDateKey = src.lastVisitDateKey;
  }

  return { ok: true, data: out as Partial<QuestOSSnapshot> };
}
