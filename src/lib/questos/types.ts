/**
 * QuestOS domain types.
 *
 * QuestOS is the platform layer beneath BibleQuest. BibleQuest is the first
 * faith provider ("christianity"). These types deliberately avoid hard-coding
 * Christianity into the platform layer where a generic name works.
 */

// ---------------------------------------------------------------------------
// Faith provider
// ---------------------------------------------------------------------------

export interface FaithProvider {
  key: string;
  name: string;
  canonicalTextLabel: string;
}

export const BIBLEQUEST_PROVIDER: FaithProvider = {
  key: "christianity",
  name: "BibleQuest",
  canonicalTextLabel: "Bible",
};

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
}

export interface AppearanceSettings {
  theme: "light" | "dark" | "system";
  reducedMotion: boolean;
  textSize: "default" | "large";
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
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: { theme: "light", reducedMotion: false, textSize: "default" },
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
};

/**
 * Local deletions the sync engine still needs to propagate to the account.
 * Prayers/reflections are tracked by id; bookmarks by their natural key.
 */
export interface SyncTombstones {
  prayers: string[];
  reflections: string[];
  bookmarks: Array<{ bookSlug: string; chapter: number; verse: number }>;
}

export function emptyTombstones(): SyncTombstones {
  return { prayers: [], reflections: [], bookmarks: [] };
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
}

// ---------------------------------------------------------------------------
// Subscription (scaffold — V1 gates nothing spiritual)
// ---------------------------------------------------------------------------

export type PlanKey = "free" | "plus" | "patron";

export type FeatureKey =
  | "ai_guide"
  | "personalized_quests"
  | "advanced_reading_plans"
  | "premium_themes"
  | "voice_journaling"
  | "reflection_insights"
  | "year_in_review"
  | "family_groups";

export interface SubscriptionState {
  plan: PlanKey;
  status: "none" | "active" | "canceled";
}
