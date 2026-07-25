/**
 * Sync mapping — converts between the local QuestOS store shapes (camelCase)
 * and the Supabase row shapes (snake_case) defined in supabase/migrations.
 *
 * Conventions:
 *  - Local ids are UUIDs and become the row `id`, so upserts are idempotent.
 *  - `dateKey` fields (source-local YYYY-MM-DD) map to date columns directly;
 *    legacy rows without a Journey date fall back to the reader's local time.
 *  - Optional local fields map to nullable columns and back to undefined.
 */
import { isValidDateKey, toDateKey } from "@/lib/utils/dates";
import type {
  ChapterRead,
  DailyQuestAssignment,
  DailyQuestStatus,
  GrowthEvent,
  GrowthType,
  JourneyEvent,
  JourneyEventType,
  EarnedMilestone,
  MyQuest,
  MyQuestStatus,
  Prayer,
  PrayerCategory,
  PrayerStatus,
  Profile,
  QuestCompletion,
  QuestStepKey,
  RecentVerse,
  ReadingPosition,
  Reflection,
  ReflectionMood,
  Settings,
  VerseBookmark,
} from "@/lib/questos/types";
import { normalizeBibleTranslationKey } from "@/lib/bible/translations";
import { DEFAULT_SETTINGS } from "@/lib/questos/types";

// ---------------------------------------------------------------------------
// Row shapes (subset of columns the app reads/writes)
// ---------------------------------------------------------------------------

export interface PrayerRow {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  category: string;
  status: string;
  answered_at: string | null;
  answer_reflection: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReflectionRow {
  id: string;
  user_id: string;
  prompt: string | null;
  body: string;
  mood: string | null;
  related_quest_slug: string | null;
  related_verse_reference: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompletionRow {
  id: string;
  user_id: string;
  quest_slug: string;
  reflection_id: string | null;
  completed_at: string;
}

export interface DailyQuestRow {
  user_id: string;
  quest_slug: string;
  assigned_date: string;
  status: string;
  rerolls: number;
  started_at: string | null;
  completed_at: string | null;
  picked_at: string;
  expires_at: string;
}

export interface RecentVerseRow {
  user_id: string;
  book_slug: string;
  book_name: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  reference: string;
  text: string;
  viewed_at: string;
}

export interface UserQuestRow {
  user_id: string;
  quest_slug: string;
  status: string;
  steps_done: string[];
  times_completed: number;
  added_at: string;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  last_activity_at: string;
}

export interface BookmarkRow {
  id: string;
  user_id: string;
  book_slug: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  translation_key: string;
  note: string | null;
  created_at: string;
}

export interface ReadingProgressRow {
  user_id: string;
  book_slug: string;
  book_name: string;
  chapter: number;
  updated_at: string;
}

export interface ChapterReadRow {
  user_id: string;
  book_slug: string;
  chapter: number;
  read_on: string;
}

export interface JourneyEventRow {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  detail: string | null;
  date_key?: string | null;
  source_id?: string | null;
  occurred_at: string;
}

export interface GrowthEventRow {
  id: string;
  user_id: string;
  growth_type: string;
  amount: number;
  source_type: string;
  occurred_at: string;
}

export interface UserMilestoneRow {
  user_id: string;
  milestone_key: string;
  achieved_at: string;
}

export interface ProfileRow {
  id: string;
  display_name: string;
  tradition: string | null;
  primary_goal: string | null;
  calling: string | null;
  daily_rhythm: string | null;
  quest_style: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
  avatar_path?: string | null;
  avatar_version?: string | null;
  avatar_updated_at?: string | null;
}

export interface UserSettingsRow {
  user_id: string;
  theme: string;
  reduced_motion: boolean;
  text_size: string;
  quest_duration_pref: number[];
  quest_category_pref: string[];
  language: string;
  preferred_bible_translation: string;
  analytics_consent: boolean;
  updated_at: string;
}

export interface NotificationPrefsRow {
  user_id: string;
  daily_verse_enabled: boolean;
  daily_quest_enabled: boolean;
  prayer_reminders_enabled: boolean;
  weekly_recap_enabled: boolean;
  preferred_time: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Local -> row
// ---------------------------------------------------------------------------

export function prayerToRow(uid: string, p: Prayer): PrayerRow {
  const legacyArchived = p.status === "archived";
  return {
    id: p.id,
    user_id: uid,
    title: p.title ?? null,
    body: p.body,
    category: p.category,
    status: legacyArchived ? (p.answeredAt ? "answered" : "active") : p.status,
    answered_at: p.answeredAt ?? null,
    answer_reflection: p.answerReflection ?? null,
    archived_at: p.archivedAt ?? (legacyArchived ? p.updatedAt : null),
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function reflectionToRow(uid: string, r: Reflection): ReflectionRow {
  return {
    id: r.id,
    user_id: uid,
    prompt: r.prompt ?? null,
    body: r.body,
    mood: r.mood ?? null,
    related_quest_slug: r.relatedQuestSlug ?? null,
    related_verse_reference: r.relatedVerseReference ?? null,
    archived_at: r.archivedAt ?? null,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export function completionToRow(uid: string, c: QuestCompletion): CompletionRow {
  return {
    id: c.id,
    user_id: uid,
    quest_slug: c.questSlug,
    reflection_id: c.reflectionId ?? null,
    completed_at: c.completedAt,
  };
}

export function assignmentToRow(
  uid: string,
  a: DailyQuestAssignment
): DailyQuestRow {
  return {
    user_id: uid,
    quest_slug: a.questSlug,
    assigned_date: a.dateKey,
    status: a.status,
    rerolls: a.rerolls,
    started_at: a.startedAt ?? null,
    completed_at: a.completedAt ?? null,
    picked_at: a.pickedAt,
    expires_at: a.expiresAt,
  };
}

export function recentVerseToRow(
  uid: string,
  verse: RecentVerse,
): RecentVerseRow {
  return {
    user_id: uid,
    book_slug: verse.bookSlug,
    book_name: verse.bookName,
    chapter: verse.chapter,
    verse_start: verse.verseStart,
    verse_end: verse.verseEnd,
    reference: verse.reference,
    text: verse.text,
    viewed_at: verse.viewedAt,
  };
}

export function myQuestToRow(uid: string, q: MyQuest): UserQuestRow {
  return {
    user_id: uid,
    quest_slug: q.questSlug,
    status: q.status,
    steps_done: q.stepsDone,
    times_completed: q.timesCompleted,
    added_at: q.addedAt,
    started_at: q.startedAt ?? null,
    paused_at: q.pausedAt ?? null,
    completed_at: q.completedAt ?? null,
    archived_at: q.archivedAt ?? null,
    last_activity_at: q.lastActivityAt,
  };
}

export function bookmarkToRow(uid: string, b: VerseBookmark): BookmarkRow {
  return {
    id: b.id,
    user_id: uid,
    book_slug: b.bookSlug,
    book_name: b.bookName,
    chapter: b.chapter,
    verse: b.verse,
    text: b.text,
    translation_key: b.translationKey ?? "web",
    note: b.note ?? null,
    created_at: b.createdAt,
  };
}

export function readingPositionToRow(
  uid: string,
  r: ReadingPosition
): ReadingProgressRow {
  return {
    user_id: uid,
    book_slug: r.bookSlug,
    book_name: r.bookName,
    chapter: r.chapter,
    updated_at: r.updatedAt,
  };
}

export function chapterReadToRow(uid: string, c: ChapterRead): ChapterReadRow {
  return {
    user_id: uid,
    book_slug: c.bookSlug,
    chapter: c.chapter,
    read_on: c.dateKey,
  };
}

export function journeyEventToRow(uid: string, e: JourneyEvent): JourneyEventRow {
  return {
    id: e.id,
    user_id: uid,
    event_type: e.type,
    title: e.title,
    detail: e.detail ?? null,
    date_key: e.dateKey,
    source_id: e.sourceId ?? null,
    occurred_at: e.occurredAt,
  };
}

export function growthEventToRow(uid: string, e: GrowthEvent): GrowthEventRow {
  return {
    id: e.id,
    user_id: uid,
    growth_type: e.growthType,
    amount: e.amount,
    source_type: e.sourceType,
    occurred_at: e.occurredAt,
  };
}

export function milestoneToRow(uid: string, m: EarnedMilestone): UserMilestoneRow {
  return { user_id: uid, milestone_key: m.key, achieved_at: m.achievedAt };
}

export function profileToRow(uid: string, p: Profile): ProfileRow {
  return {
    id: uid,
    display_name: p.displayName,
    tradition: p.tradition ?? null,
    primary_goal: p.primaryGoal ?? null,
    calling: p.calling ?? null,
    daily_rhythm: p.dailyRhythm ?? null,
    quest_style: p.questStyle ?? null,
    onboarding_completed: p.onboardingCompleted,
    created_at: p.createdAt,
    updated_at: p.updatedAt ?? p.createdAt,
  };
}

export function settingsToRows(
  uid: string,
  s: Settings
): { settings: UserSettingsRow; notifications: NotificationPrefsRow } {
  const updatedAt = s.updatedAt ?? "1970-01-01T00:00:00.000Z";
  const notificationsUpdatedAt = s.notificationsUpdatedAt ?? updatedAt;
  return {
    settings: {
      user_id: uid,
      theme: s.appearance.theme,
      reduced_motion: s.appearance.reducedMotion,
      text_size: s.appearance.textSize,
      quest_duration_pref: s.questDurationPreference,
      quest_category_pref: s.questCategoryPreference,
      language: s.language,
      preferred_bible_translation: s.preferredBibleTranslation,
      analytics_consent: s.analyticsConsent,
      updated_at: updatedAt,
    },
    notifications: {
      user_id: uid,
      daily_verse_enabled: s.notifications.dailyVerse,
      daily_quest_enabled: s.notifications.dailyQuest,
      prayer_reminders_enabled: s.notifications.prayerReminders,
      weekly_recap_enabled: s.notifications.weeklyRecap,
      preferred_time: s.notifications.preferredTime,
      updated_at: notificationsUpdatedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// Row -> local
// ---------------------------------------------------------------------------

export function rowToPrayer(row: PrayerRow): Prayer {
  const legacyArchived = row.status === "archived";
  return {
    id: row.id,
    title: row.title ?? undefined,
    body: row.body,
    category: row.category as PrayerCategory,
    status: (legacyArchived
      ? row.answered_at
        ? "answered"
        : "active"
      : row.status) as PrayerStatus,
    answeredAt: row.answered_at ?? undefined,
    answerReflection: row.answer_reflection ?? undefined,
    archivedAt:
      row.archived_at ?? (legacyArchived ? row.updated_at : undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToReflection(row: ReflectionRow): Reflection {
  return {
    id: row.id,
    prompt: row.prompt ?? undefined,
    body: row.body,
    mood: (row.mood ?? undefined) as ReflectionMood | undefined,
    relatedQuestSlug: row.related_quest_slug ?? undefined,
    relatedVerseReference: row.related_verse_reference ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToCompletion(row: CompletionRow): QuestCompletion {
  return {
    id: row.id,
    questSlug: row.quest_slug,
    dateKey: toDateKey(new Date(row.completed_at)),
    completedAt: row.completed_at,
    reflectionId: row.reflection_id ?? undefined,
  };
}

export function rowToAssignment(row: DailyQuestRow): DailyQuestAssignment {
  return {
    dateKey: row.assigned_date,
    questSlug: row.quest_slug,
    status: row.status as DailyQuestStatus,
    rerolls: row.rerolls,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    pickedAt: row.picked_at,
    expiresAt: row.expires_at,
  };
}

export function rowToRecentVerse(row: RecentVerseRow): RecentVerse {
  return {
    bookSlug: row.book_slug,
    bookName: row.book_name,
    chapter: row.chapter,
    verseStart: row.verse_start,
    verseEnd: row.verse_end,
    reference: row.reference,
    text: row.text,
    viewedAt: row.viewed_at,
  };
}

export function rowToMyQuest(row: UserQuestRow): MyQuest {
  return {
    questSlug: row.quest_slug,
    status: row.status as MyQuestStatus,
    stepsDone: (row.steps_done ?? []) as QuestStepKey[],
    timesCompleted: row.times_completed,
    addedAt: row.added_at,
    startedAt: row.started_at ?? undefined,
    pausedAt: row.paused_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    lastActivityAt: row.last_activity_at,
  };
}

export function rowToBookmark(row: BookmarkRow): VerseBookmark {
  return {
    id: row.id,
    bookSlug: row.book_slug,
    bookName: row.book_name,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text,
    translationKey: row.translation_key ?? "web",
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

export function rowToReadingPosition(row: ReadingProgressRow): ReadingPosition {
  return {
    bookSlug: row.book_slug,
    bookName: row.book_name,
    chapter: row.chapter,
    updatedAt: row.updated_at,
  };
}

export function rowToChapterRead(row: ChapterReadRow): ChapterRead {
  return { bookSlug: row.book_slug, chapter: row.chapter, dateKey: row.read_on };
}

export function rowToJourneyEvent(row: JourneyEventRow): JourneyEvent {
  const utcDateKey = row.occurred_at.slice(0, 10);
  return {
    id: row.id,
    type: row.event_type as JourneyEventType,
    title: row.title,
    detail: row.detail ?? undefined,
    sourceId: row.source_id ?? undefined,
    dateKey:
      row.date_key && isValidDateKey(row.date_key)
        ? row.date_key
        : isValidDateKey(utcDateKey)
          ? utcDateKey
          : toDateKey(new Date(row.occurred_at)),
    occurredAt: row.occurred_at,
  };
}

export function rowToGrowthEvent(row: GrowthEventRow): GrowthEvent {
  return {
    id: row.id,
    growthType: row.growth_type as GrowthType,
    amount: row.amount,
    sourceType: row.source_type as JourneyEventType,
    occurredAt: row.occurred_at,
  };
}

export function rowToMilestone(row: UserMilestoneRow): EarnedMilestone {
  return { key: row.milestone_key, achievedAt: row.achieved_at };
}

export function rowToProfile(row: ProfileRow): Profile {
  return {
    displayName: row.display_name,
    tradition: (row.tradition ?? undefined) as Profile["tradition"],
    primaryGoal: (row.primary_goal ?? undefined) as Profile["primaryGoal"],
    calling: (row.calling ?? undefined) as Profile["calling"],
    dailyRhythm: (row.daily_rhythm ?? undefined) as Profile["dailyRhythm"],
    questStyle: (row.quest_style ?? undefined) as Profile["questStyle"],
    onboardingCompleted: row.onboarding_completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    avatarVersion:
      row.avatar_version === undefined ? undefined : row.avatar_version,
    avatarUpdatedAt:
      row.avatar_updated_at === undefined ? undefined : row.avatar_updated_at,
  };
}

export function rowsToSettings(
  settings: UserSettingsRow | null,
  notifications: NotificationPrefsRow | null
): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    appearance: {
      theme: (settings?.theme ?? d.appearance.theme) as Settings["appearance"]["theme"],
      reducedMotion: settings?.reduced_motion ?? d.appearance.reducedMotion,
      textSize: (settings?.text_size ??
        d.appearance.textSize) as Settings["appearance"]["textSize"],
      // Device-local; no remote column. mergeSnapshots preserves the local
      // value — this default only satisfies the shape.
      boldText: d.appearance.boldText,
      wallpaperId: d.appearance.wallpaperId,
      wallpaperMode: d.appearance.wallpaperMode,
      glassSurfaces: d.appearance.glassSurfaces,
      glassOpacity: d.appearance.glassOpacity,
    },
    notifications: {
      dailyVerse: notifications?.daily_verse_enabled ?? d.notifications.dailyVerse,
      dailyQuest: notifications?.daily_quest_enabled ?? d.notifications.dailyQuest,
      prayerReminders:
        notifications?.prayer_reminders_enabled ?? d.notifications.prayerReminders,
      weeklyRecap:
        notifications?.weekly_recap_enabled ?? d.notifications.weeklyRecap,
      preferredTime: (notifications?.preferred_time ??
        d.notifications.preferredTime) as Settings["notifications"]["preferredTime"],
    },
    questDurationPreference: (settings?.quest_duration_pref ??
      d.questDurationPreference) as Settings["questDurationPreference"],
    questCategoryPreference: (settings?.quest_category_pref ??
      d.questCategoryPreference) as Settings["questCategoryPreference"],
    language: settings?.language ?? d.language,
    preferredBibleTranslation: normalizeBibleTranslationKey(
      settings?.preferred_bible_translation ?? d.preferredBibleTranslation,
    ),
    analyticsConsent: settings?.analytics_consent ?? d.analyticsConsent,
    updatedAt: settings?.updated_at ?? d.updatedAt,
    notificationsUpdatedAt:
      notifications?.updated_at ?? d.notificationsUpdatedAt,
  };
}
