/**
 * QuestOS domain types.
 *
 * QuestOS is the platform layer beneath BibleQuest. BibleQuest is the first
 * faith provider ("christianity"). These types deliberately avoid hard-coding
 * Christianity into the platform layer where a generic name works.
 */
import { DEFAULT_BIBLE_TRANSLATION_KEY } from "@/lib/bible/defaults";
import {
  DEFAULT_WALLPAPER_ID,
  type WallpaperId,
} from "@/lib/wallpapers/catalog";
import { DEFAULT_GLASS_OPACITY } from "@/lib/glass-opacity";

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export const QUEST_CATEGORIES = [
  "prayer",
  "scripture",
  "service",
  "kindness",
  "forgiveness",
  "generosity",
  "discipline",
  "gratitude",
  "silence",
  "worship",
  "family",
  "community",
  "reflection",
  "patience",
] as const;
export type QuestCategory = (typeof QUEST_CATEGORIES)[number];

export const QUEST_DURATIONS = [5, 10, 15, 30, 60, 240, 480] as const;
export type QuestDuration = (typeof QUEST_DURATIONS)[number];

export type Difficulty = "gentle" | "steady" | "devoted";
export type EnergyLevel = "low" | "medium" | "high";
export type SoloOrSocial = "solo" | "social" | "either";
export type IndoorOrOutdoor = "indoor" | "outdoor" | "either";

export const GROWTH_TYPES = [
  "roots",
  "branches",
  "leaves",
  "fruit",
  "sunlight",
  "flowers",
] as const;
export type GrowthType = (typeof GROWTH_TYPES)[number];

export type SeasonKey =
  | "ordinary_time"
  | "advent"
  | "christmas"
  | "lent"
  | "holy_week"
  | "easter"
  | "pentecost";

/**
 * One required checkpoint in a quest-specific checklist. The key reuses the
 * four persisted walk movements, so checklist progress syncs through the
 * existing `MyQuest.stepsDone` field without a second source of truth.
 */
export interface QuestChecklistItem {
  key: QuestStepKey;
  label: string;
}

export interface QuestTemplate {
  slug: string;
  title: string;
  category: QuestCategory;
  durationMinutes: QuestDuration;
  difficulty: Difficulty;
  energyLevel: EnergyLevel;
  soloOrSocial: SoloOrSocial;
  indoorOrOutdoor: IndoorOrOutdoor;
  invitation: string;
  whyItMatters: string;
  scriptureReference: string;
  /** Exact WEB text snapshot, hydrated from the imported Bible data. */
  scriptureText?: string;
  reflectionPrompt: string;
  prayerPrompt: string;
  growthType: GrowthType;
  tags: string[];
  seasonTags: SeasonKey[];
  traditionTags: string[];
  sensitivityTags: string[];
  isPremium: boolean;
  /**
   * Required completion checkpoints for this quest. Omitted or empty means
   * the generic walk movements remain optional and completion is not gated.
   */
  checklist?: QuestChecklistItem[];
}

export type DailyQuestStatus =
  | "assigned"
  | "started"
  | "completed"
  /** Legacy hidden reservation; new removals delete the assignment instead. */
  | "released";

/**
 * One quest-board assignment, grouped by its local pick date for persistence.
 * Ready assignments occupy a spot without a running timer. Beginning or
 * resuming writes a fresh 24-hour window into startedAt/expiresAt.
 */
export interface DailyQuestAssignment {
  dateKey: string; // YYYY-MM-DD (local)
  questSlug: string;
  status: DailyQuestStatus;
  /** When the user added this quest to their day. */
  pickedAt: string;
  /** Active window end. Ignored while status is "assigned". */
  expiresAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Legacy (pre-pick model): times the user rerolled the assigned quest. */
  rerolls: number;
}

export interface QuestCompletion {
  id: string;
  questSlug: string;
  dateKey: string;
  completedAt: string;
  reflectionId?: string;
}

export type QuestCompletionFailureReason =
  | "unknown_quest"
  | "window_closed"
  | "already_completed"
  | "not_started"
  | "checklist_incomplete";

export type QuestCompletionResult =
  | { completed: true; newMilestones: MilestoneSeed[] }
  | {
      completed: false;
      newMilestones: MilestoneSeed[];
      reason: QuestCompletionFailureReason;
    };

// ---------------------------------------------------------------------------
// My Quests — the persistent quest shelf
// ---------------------------------------------------------------------------

/**
 * Every quest walks the same four gentle movements, derived from the
 * template's own content (scripture → invitation → reflection → prayer).
 * See quest-steps.ts. Steps are an aid to picking back up mid-quest,
 * never an obligation — completing a quest completes them all.
 */
export const QUEST_STEP_KEYS = ["scripture", "live", "reflect", "pray"] as const;
export type QuestStepKey = (typeof QUEST_STEP_KEYS)[number];

/**
 * Lifecycle of a quest on the user's shelf. Unlike a daily pick (which
 * belongs to a single day), a MyQuest entry persists until the user
 * removes it — so beginning one quest never displaces another.
 *
 *  - "saved":     tucked away for another day, never begun (or reset)
 *  - "active":    on the journey now — picked for a day or begun
 *  - "paused":    deliberately set down; waits without expiring
 *  - "completed": finished (repeatable — reopening starts a fresh walk)
 *  - "archived":  kept for the record, out of the main feed
 */
export type MyQuestStatus =
  | "saved"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export interface MyQuest {
  questSlug: string;
  status: MyQuestStatus;
  /** When the quest first joined the shelf. */
  addedAt: string;
  /** First time the user began this walk (cleared on reopen). */
  startedAt?: string;
  pausedAt?: string;
  /** Most recent completion. */
  completedAt?: string;
  archivedAt?: string;
  /** Any interaction — drives feed ordering and sync conflict resolution. */
  lastActivityAt: string;
  /** Steps finished on the CURRENT walk (reset when reopened). */
  stepsDone: QuestStepKey[];
  /** Lifetime completions across reopenings. */
  timesCompleted: number;
}

// ---------------------------------------------------------------------------
// Scripture
// ---------------------------------------------------------------------------

export interface BibleBookMeta {
  slug: string;
  name: string;
  testament: "old" | "new";
  order: number;
  chapterCount: number;
  verseCounts: number[];
}

export interface DailyVerse {
  id: string;
  reference: string;
  bookSlug: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  text: string;
  theme: string;
}

export interface VerseBookmark {
  id: string;
  bookSlug: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
  /** Edition actually shown when saved; legacy bookmarks are bundled WEB. */
  translationKey?: string;
  note?: string;
  createdAt: string;
}

export interface ReadingPosition {
  bookSlug: string;
  bookName: string;
  chapter: number;
  updatedAt: string;
}

export interface ChapterRead {
  bookSlug: string;
  chapter: number;
  dateKey: string;
}

/**
 * A verse the person intentionally viewed or selected. This is navigation
 * history, not a bookmark: entries are deduplicated by passage and capped by
 * the store so the Bible hub can offer a small, useful "Recent verses" shelf.
 */
export interface RecentVerse {
  bookSlug: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  reference: string;
  text: string;
  viewedAt: string;
}

// ---------------------------------------------------------------------------
// Guided Scripture & Pilgrimages
// ---------------------------------------------------------------------------

/** The six movements shared by every reviewed guided practice. */
export const GUIDED_MOVEMENT_KEYS = [
  "arrive",
  "read",
  "notice",
  "reflect",
  "respond",
  "pray",
] as const;
export type GuidedMovementKey = (typeof GUIDED_MOVEMENT_KEYS)[number];

export type GuidedSessionKind = "daily" | "pilgrimage_day";

/**
 * Device-local progress for one versioned guided practice.
 *
 * Guide completion is intentionally separate from Journey and growth ledgers.
 * Scripture, reflection, prayer, and quest actions keep using their existing
 * records, so moving through a guide can never double-count spiritual growth.
 */
export interface GuidedSessionProgress {
  sessionKey: string;
  contentId: string;
  kind: GuidedSessionKind;
  completedMovements: GuidedMovementKey[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Prayer
// ---------------------------------------------------------------------------

export const PRAYER_CATEGORIES = [
  "morning",
  "evening",
  "gratitude",
  "difficulty",
  "intercession",
  "stillness",
  "forgiveness",
  "courage",
  "family",
  "work",
  "general",
] as const;
export type PrayerCategory = (typeof PRAYER_CATEGORIES)[number];

export type PrayerStatus = "active" | "answered" | "archived";

export interface Prayer {
  id: string;
  title?: string;
  body: string;
  category: PrayerCategory;
  status: PrayerStatus;
  answeredAt?: string;
  answerReflection?: string;
  /** Archival is independent from whether a prayer is active or answered. */
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrayerPromptSeed {
  id: string;
  text: string;
  category: PrayerCategory;
}

// ---------------------------------------------------------------------------
// Reflection
// ---------------------------------------------------------------------------

export type ReflectionContext =
  | "after_quest"
  | "after_scripture"
  | "after_prayer"
  | "morning"
  | "evening"
  | "gratitude"
  | "difficulty"
  | "general";

export const REFLECTION_MOODS = [
  "grateful",
  "peaceful",
  "hopeful",
  "tired",
  "tender",
  "unsettled",
] as const;
export type ReflectionMood = (typeof REFLECTION_MOODS)[number];

export interface Reflection {
  id: string;
  prompt?: string;
  body: string;
  mood?: ReflectionMood;
  relatedQuestSlug?: string;
  relatedVerseReference?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReflectionPromptSeed {
  id: string;
  text: string;
  context: ReflectionContext;
}

// ---------------------------------------------------------------------------
// Journey & growth
// ---------------------------------------------------------------------------

export const JOURNEY_EVENT_TYPES = [
  "quest_completed",
  "reflection_written",
  "prayer_created",
  "prayer_answered",
  "chapter_read",
  "verse_bookmarked",
  "milestone_reached",
] as const;
export type JourneyEventType = (typeof JOURNEY_EVENT_TYPES)[number];

/** Actions that represent a day of lived practice and can advance the candle. */
export const MEANINGFUL_JOURNEY_EVENT_TYPES = [
  "quest_completed",
  "reflection_written",
  "prayer_created",
  "prayer_answered",
  "chapter_read",
] as const satisfies readonly JourneyEventType[];

export interface JourneyEvent {
  id: string;
  type: JourneyEventType;
  title: string;
  detail?: string;
  /** Stable originating record or passage, used for cumulative history. */
  sourceId?: string;
  dateKey: string;
  occurredAt: string;
}

export interface GrowthEvent {
  id: string;
  growthType: GrowthType;
  amount: number;
  sourceType: JourneyEventType;
  occurredAt: string;
}

export const TREE_STAGES = [
  "seed",
  "stirring-seed",
  "first-root",
  "first-shoot",
  "sprout",
  "rooted-sprout",
  "young-sapling",
  "branching-sapling",
  "leafing-sapling",
  "young",
  "growing",
  "spreading",
  "budding",
  "flowering",
  "first-fruit",
  "fruit-bearing",
  "flourishing",
  "sturdy",
  "shade",
  "sheltering",
] as const;
export type TreeStage = (typeof TREE_STAGES)[number];

export interface GrowthTreeState {
  stage: TreeStage;
  stageLabel: string;
  totalActions: number;
  /** Actions remaining until the next stage; null at the final stage. */
  toNextStage: number | null;
  byType: Record<GrowthType, number>;
}

export type MilestoneMetric =
  | "quest_completions"
  | "prayers_created"
  | "reflections_created"
  | "prayers_answered"
  | "chapters_read"
  | "verses_bookmarked"
  | "quests_prayer"
  | "quests_scripture"
  | "quests_kindness"
  | "quests_service"
  | "quests_gratitude"
  | "quests_silence"
  | "quests_family"
  | "quests_community"
  | "quests_forgiveness"
  | "quests_generosity"
  | "quests_discipline"
  | "quests_worship"
  | "quests_reflection"
  | "quests_patience"
  | "journey_days";

export interface MilestoneSeed {
  key: string;
  title: string;
  description: string;
  milestoneType: string;
  requirementMetric: MilestoneMetric;
  requirementCount: number;
  iconKey: string;
}

export interface EarnedMilestone {
  key: string;
  achievedAt: string;
}

// ---------------------------------------------------------------------------
// Profile & preferences
// ---------------------------------------------------------------------------

export type Tradition =
  | "catholic"
  | "protestant"
  | "orthodox"
  | "non_denominational"
  | "exploring"
  | "prefer_not_to_say";

export type DailyRhythm = "morning" | "afternoon" | "evening" | "flexible";

export type QuestStyle =
  | "quiet"
  | "scripture"
  | "service"
  | "kindness"
  | "discipline"
  | "surprise";

export type PrimaryGoal =
  | "grow_closer"
  | "read_scripture"
  | "prayer_habit"
  | "practice_kindness"
  | "return_to_faith"
  | "explore_christianity"
  | "family_church";

export type Calling =
  | "student"
  | "parent"
  | "creative"
  | "business_owner"
  | "teacher"
  | "healthcare"
  | "caregiver"
  | "athlete"
  | "new_believer"
  | "returning"
  | "retired"
  | "prefer_not_to_say";

export interface Profile {
  displayName: string;
  primaryGoal?: PrimaryGoal;
  tradition?: Tradition;
  dailyRhythm?: DailyRhythm;
  questStyle?: QuestStyle;
  calling?: Calling;
  onboardingCompleted: boolean;
  createdAt: string;
  /** Last change to account-synced profile fields; legacy snapshots may omit it. */
  updatedAt?: string;
  /**
   * Opaque server version for an account avatar. Image bytes stay in private
   * Storage plus the version-keyed IndexedDB cache, never in this JSON store.
   */
  avatarVersion?: string | null;
  /** Pre-account-sync local marker retained only for legacy avatar migration. */
  avatarUpdatedAt?: string | null;
}

export interface AppearanceSettings {
  theme: "light" | "dark" | "system";
  reducedMotion: boolean;
  textSize: "default" | "large";
  /** Accessibility: heavier weights across the UI (html.text-bold). */
  boldText: boolean;
  /** Device-local artwork choice; "none" keeps the original parchment canvas. */
  wallpaperId: WallpaperId | "none";
  /** Live keeps the same poster visible whenever motion cannot safely play. */
  wallpaperMode: "still" | "live";
  /** Translucent, blurred shared surfaces inspired by native Apple materials. */
  glassSurfaces: boolean;
  /** Visible material opacity percentage; clamped to 15–100 for legibility. */
  glassOpacity: number;
}

/**
 * Gentle daily-rhythm streak ("the candle"). Counts days with at least one
 * meaningful action (quest, prayer, reflection, chapter read). Never decays
 * mid-day; a missed day simply starts the next candle at 1 — no shame copy,
 * no regression mechanics anywhere in the UI.
 */
export interface StreakState {
  /** Consecutive active days including the most recent active day. */
  current: number;
  /** Longest run ever reached (never decreases). */
  longest: number;
  /** dateKey of the most recent active day, null before the first action. */
  lastActiveDateKey: string | null;
}

/** Same-day verse refreshes — deterministic, resets naturally at midnight. */
export interface VerseRefresh {
  dateKey: string;
  count: number;
}

export interface NotificationPreferences {
  dailyVerse: boolean;
  dailyQuest: boolean;
  prayerReminders: boolean;
  weeklyRecap: boolean;
  preferredTime: DailyRhythm;
}

export interface Settings {
  appearance: AppearanceSettings;
  notifications: NotificationPreferences;
  questDurationPreference: QuestDuration[];
  questCategoryPreference: QuestCategory[];
  /** UI-chrome language code (see src/lib/i18n). Independent of Scripture. */
  language: string;
  /**
   * Preferred Scripture edition. The rendering resolver may explicitly fall
   * back to bundled WEB until this edition is commercially licensed and
   * connected; the two must never be mislabeled as one another.
   */
  preferredBibleTranslation: string;
  /**
   * Anonymous usage analytics opt-in/out (see src/lib/analytics/events.ts).
   * Counts taps and screens only — never prayer, reflection, or note text.
   */
  analyticsConsent: boolean;
  /** Last change to account-synced base settings; device-only art preserves it. */
  updatedAt?: string;
  /** Last change to notification preferences, which live in a separate row. */
  notificationsUpdatedAt?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: {
    theme: "light",
    reducedMotion: false,
    textSize: "default",
    boldText: false,
    wallpaperId: DEFAULT_WALLPAPER_ID,
    wallpaperMode: "still",
    glassSurfaces: true,
    glassOpacity: DEFAULT_GLASS_OPACITY,
  },
  language: "en",
  preferredBibleTranslation: DEFAULT_BIBLE_TRANSLATION_KEY,
  notifications: {
    dailyVerse: false,
    dailyQuest: false,
    prayerReminders: false,
    weeklyRecap: false,
    preferredTime: "morning",
  },
  questDurationPreference: [],
  questCategoryPreference: [],
  analyticsConsent: false,
};

/**
 * Local deletions the sync engine still needs to propagate to the account.
 * Prayers/reflections are tracked by id; bookmarks by their natural key;
 * removed shelf quests by their slug.
 */
export interface SyncTombstones {
  prayers: string[];
  reflections: string[];
  bookmarks: Array<{
    bookSlug: string;
    chapter: number;
    verse: number;
    translationKey?: string;
  }>;
  myQuests: string[];
  /**
   * User id whose ENTIRE account copy must be deleted before the next push.
   * Set when the user clears or restores-over their data while signed in —
   * without it, the next initial sync would merge the account copy straight
   * back. Scoped to the id so a purge pending for account A can never touch
   * account B's rows if a different user signs in first.
   */
  purgeAccount: string | null;
}

export function emptyTombstones(): SyncTombstones {
  return {
    prayers: [],
    reflections: [],
    bookmarks: [],
    myQuests: [],
    purgeAccount: null,
  };
}

/**
 * Gentle, non-repeating account invitations. Device-local (like the streak):
 * each device decides for itself when a nudge is welcome, and dismissals on
 * one device shouldn't silence another. Excluded from the sync mapping but
 * must ride through snapshot/importData or every merge-apply would reset it.
 */
export type AccountNudgeContext =
  | "onboarding"
  | "first_quest_completed"
  | "first_reflection"
  | "milestone_reached";

export interface AccountNudgeState {
  /** Contexts already shown once — each fires at most one invitation. */
  shownContexts: AccountNudgeContext[];
  /** Most recent "Maybe later", starts the quiet period. */
  lastDismissedAt: string | null;
  /** After enough dismissals we stop asking altogether. */
  dismissCount: number;
}

export function emptyAccountNudge(): AccountNudgeState {
  return { shownContexts: [], lastDismissedAt: null, dismissCount: 0 };
}

/**
 * The persisted data fields — the exact shape of an exported journey. Mirrors
 * the store's initial-state block; a restore round-trips through this.
 */
export interface QuestOSSnapshot {
  profile: Profile | null;
  settings: Settings;
  /** Rolling quest windows grouped by local pick date. */
  assignments: Record<string, DailyQuestAssignment[]>;
  /** The persistent quest shelf, keyed by quest slug. */
  myQuests?: Record<string, MyQuest>;
  completions: QuestCompletion[];
  prayers: Prayer[];
  reflections: Reflection[];
  journeyEvents: JourneyEvent[];
  growthEvents: GrowthEvent[];
  earnedMilestones: EarnedMilestone[];
  bookmarks: VerseBookmark[];
  readingPosition: ReadingPosition | null;
  chaptersRead: ChapterRead[];
  /** Optional for exports created before rolling quest windows/recent verses. */
  recentVerses?: RecentVerse[];
  pendingMilestones: string[];
  lastVisitDateKey: string | null;
  /** Optional — exports from before the candle streak omit it. */
  streak?: StreakState;
  /** Optional & device-local — rides through restores like the streak. */
  accountNudge?: AccountNudgeState;
  /**
   * Optional for pre-guides exports. Progress is device-local but portable in
   * an explicit backup and preserved across account-sync merge applies.
   */
  guidedProgress?: Record<string, GuidedSessionProgress>;
}

export function emptyStreak(): StreakState {
  return { current: 0, longest: 0, lastActiveDateKey: null };
}

// ---------------------------------------------------------------------------
// Subscription (scaffold — V1 gates nothing spiritual)
// ---------------------------------------------------------------------------

export type PlanKey = "free" | "plus" | "patron";
