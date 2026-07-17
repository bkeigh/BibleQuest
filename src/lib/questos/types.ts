/**
 * QuestOS domain types.
 *
 * QuestOS is the platform layer beneath BibleQuest. BibleQuest is the first
 * faith provider ("christianity"). These types deliberately avoid hard-coding
 * Christianity into the platform layer where a generic name works.
 */

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
}

export type DailyQuestStatus = "assigned" | "started" | "completed";

/**
 * One quest the user picked for a given day. Days hold up to
 * MAX_DAILY_PICKS of these (see quest-engine.ts) — picking is the
 * user's move now, not the algorithm's.
 */
export interface DailyQuestAssignment {
  dateKey: string; // YYYY-MM-DD (local)
  questSlug: string;
  status: DailyQuestStatus;
  /** When the user added this quest to their day. */
  pickedAt?: string;
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

export type JourneyEventType =
  | "quest_completed"
  | "reflection_written"
  | "prayer_created"
  | "prayer_answered"
  | "chapter_read"
  | "verse_bookmarked"
  | "milestone_reached";

export interface JourneyEvent {
  id: string;
  type: JourneyEventType;
  title: string;
  detail?: string;
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
  "sprout",
  "young",
  "growing",
  "fruit-bearing",
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
  /**
   * Set when a profile photo exists in the on-device media store (IndexedDB —
   * see src/lib/utils/avatar.ts). The image itself deliberately stays OUT of
   * this persisted blob: localStorage re-serializes the whole store on every
   * write, and the sync engine must never ship the photo to the account.
   */
  avatarUpdatedAt?: string | null;
}

export interface AppearanceSettings {
  theme: "light" | "dark" | "system";
  reducedMotion: boolean;
  textSize: "default" | "large";
  /** Accessibility: heavier weights across the UI (html.text-bold). */
  boldText: boolean;
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
  /** UI-chrome language code (see src/lib/i18n). Scripture stays English (WEB). */
  language: string;
  /**
   * Anonymous usage analytics opt-in/out (see src/lib/analytics/events.ts).
   * Counts taps and screens only — never prayer, reflection, or note text.
   */
  analyticsConsent: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: {
    theme: "light",
    reducedMotion: false,
    textSize: "default",
    boldText: false,
  },
  language: "en",
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
  bookmarks: Array<{ bookSlug: string; chapter: number; verse: number }>;
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
  /** Per-day picked quests (up to MAX_DAILY_PICKS per dateKey). */
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
  pendingMilestones: string[];
  lastVisitDateKey: string | null;
  /** Optional — exports from before the candle streak omit it. */
  streak?: StreakState;
  /** Optional & device-local — rides through restores like the streak. */
  accountNudge?: AccountNudgeState;
}

export function emptyStreak(): StreakState {
  return { current: 0, longest: 0, lastActiveDateKey: null };
}

// ---------------------------------------------------------------------------
// Subscription (scaffold — V1 gates nothing spiritual)
// ---------------------------------------------------------------------------

export type PlanKey = "free" | "plus" | "patron";
