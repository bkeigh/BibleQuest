"use client";

/**
 * QuestOS client store — guest-mode data layer.
 *
 * V1 runs private-by-default on the user's device (localStorage) so the full
 * daily loop works with zero configuration. The Supabase repository
 * (lib/supabase) implements the same shapes behind auth + RLS and can be
 * switched in when credentials are configured. See docs/SETUP.md.
 *
 * Privacy rule (Codex, Volume VIII): prayer and reflection body text never
 * leaves this store for analytics, logs, or AI.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { questBySlug } from "@/data/seed/quests";
import { seedMilestones } from "@/data/seed/milestones";
import {
  FREE_QUEST_SLOTS,
  isQuestWindowOpen,
  normalizeAssignmentWindow,
  QUEST_PICK_UNDO_MS,
  QUEST_WINDOW_MS,
  questSlotsRemaining,
} from "./quest-engine";
import { computeMetrics, checkMilestones } from "./milestone-engine";
import { toDateKey } from "@/lib/utils/dates";
import { track, setAnalyticsConsent } from "@/lib/analytics/events";
import { DEFAULT_BIBLE_TRANSLATION_KEY } from "@/lib/bible/defaults";
import {
  DEFAULT_SETTINGS,
  QUEST_STEP_KEYS,
  type AccountNudgeContext,
  type AccountNudgeState,
  type DailyQuestAssignment,
  type EarnedMilestone,
  type GrowthEvent,
  type JourneyEvent,
  type JourneyEventType,
  type MilestoneSeed,
  type MyQuest,
  type Prayer,
  type PrayerCategory,
  type Profile,
  type QuestCompletion,
  type QuestCompletionResult,
  type QuestStepKey,
  type QuestTemplate,
  type ReadingPosition,
  type RecentVerse,
  type Reflection,
  type ReflectionMood,
  type Settings,
  type ChapterRead,
  type VerseBookmark,
  type GrowthType,
  type QuestOSSnapshot,
  type SyncTombstones,
  type StreakState,
  type VerseRefresh,
  emptyAccountNudge,
  emptyTombstones,
  emptyStreak,
} from "./types";
import { advanceStreak } from "./streak-engine";
import { isQuestChecklistComplete } from "./quest-steps";
import { canRefreshDailyVerse } from "./verse-engine";
import {
  DEFAULT_WALLPAPER_ID,
  isWallpaperId,
} from "@/lib/wallpapers/catalog";

function id(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // RFC4122-shaped fallback so ids stay valid uuid columns for account sync.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function normalizePrayerArchive(prayer: Prayer): Prayer {
  if (prayer.status !== "archived") return prayer;
  return {
    ...prayer,
    status: prayer.answeredAt ? "answered" : "active",
    archivedAt: prayer.archivedAt ?? prayer.updatedAt,
  };
}

interface QuestOSState {
  profile: Profile | null;
  settings: Settings;
  /** Rolling windows grouped by local pick date for persistence and sync. */
  assignments: Record<string, DailyQuestAssignment[]>;
  /**
   * The persistent quest shelf ("My Quests"), keyed by quest slug. A quest
   * joins the shelf when picked, begun, or saved for later, and stays —
   * with its own status and step progress — until the user removes it.
   * Beginning one quest never displaces another.
   */
  myQuests: Record<string, MyQuest>;
  completions: QuestCompletion[];
  prayers: Prayer[];
  reflections: Reflection[];
  journeyEvents: JourneyEvent[];
  growthEvents: GrowthEvent[];
  earnedMilestones: EarnedMilestone[];
  bookmarks: VerseBookmark[];
  readingPosition: ReadingPosition | null;
  chaptersRead: ChapterRead[];
  /** Recently viewed/selected verses, newest first and deduplicated by range. */
  recentVerses: RecentVerse[];
  /** Milestones earned but not yet gently shown to the user. */
  pendingMilestones: string[];
  lastVisitDateKey: string | null;
  /**
   * The candle — consecutive days with a meaningful action. Advanced inside
   * recordAction, so every quest/prayer/reflection/chapter keeps it warm.
   * Device-local for now (not mapped by the sync engine — see
   * src/lib/sync/mapping.ts); included in exports for restore.
   */
  streak: StreakState;
  /** Same-day "Another verse" count; self-resets when the dateKey rolls. */
  verseRefresh: VerseRefresh | null;
  /**
   * Gentle account-invitation bookkeeping. Device-local (like the streak) —
   * excluded from sync mapping but rides through snapshot/importData.
   */
  accountNudge: AccountNudgeState;
  /** Local deletions the sync engine still needs to propagate remotely. */
  tombstones: SyncTombstones;

  // -- lifecycle
  completeOnboarding: (profile: Omit<Profile, "onboardingCompleted" | "createdAt">, settings?: Partial<Settings>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  recordVisit: () => void;
  /**
   * Reset to factory state. When a session exists, pass the signed-in user id
   * as `purgeAccount` so the sync engine also deletes the account copy —
   * otherwise the next initial sync merges it straight back.
   */
  clearAllData: (opts?: { purgeAccount?: string }) => void;
  /**
   * Replace all local data with a validated, previously-exported snapshot.
   * When a session exists, pass the signed-in user id as `purgeAccount` so
   * the account copy is replaced too instead of merging back on the next
   * sync. The sync engine's own merge-apply passes no opts.
   */
  importData: (
    snapshot: Partial<QuestOSSnapshot>,
    opts?: { purgeAccount?: string }
  ) => void;

  // -- rolling quest windows (three concurrent for free; unlimited for Plus)
  /** Open a 24-hour quest window. Plus status must come from usePlus(). */
  pickQuest: (slug: string, isPlus?: boolean) => boolean;
  /** Hide an unfinished quest; free reservations persist after the undo grace. */
  unpickQuest: (slug: string, isPlus?: boolean) => void;
  /** Atomically pick (if needed) and mark a quest underway. */
  startQuest: (slug: string, isPlus?: boolean) => boolean;
  completeQuestBySlug: (
    slug: string,
    reflection?: { body: string; mood?: ReflectionMood }
  ) => QuestCompletionResult;

  // -- quest shelf (My Quests — persistent, independent of the day)
  /** Tuck a quest away for another day. Returns false when it's already
   *  underway or finished (nothing to save). */
  saveQuestForLater: (slug: string) => boolean;
  /** Set an active quest down without losing its steps. */
  pauseQuest: (slug: string) => void;
  /** Take a saved or paused quest back up. */
  resumeQuest: (slug: string) => void;
  /** Keep the record out of the feed; Plus may also release its window. */
  archiveQuest: (slug: string, isPlus?: boolean) => void;
  /** Take the quest off the shelf entirely (it stays in Browse). */
  removeQuest: (slug: string, isPlus?: boolean) => void;
  /** Walk a completed (or archived) quest again with fresh steps. */
  reopenQuest: (slug: string) => void;
  /** Mark one movement of the walk done/undone (a bookmark, not a duty). */
  markQuestStep: (slug: string, step: QuestStepKey, done?: boolean) => void;

  // -- account invitations
  /** Record that a context earned its one gentle invitation. */
  markAccountNudgeShown: (context: AccountNudgeContext) => void;
  /** "Maybe later" — starts the quiet period. */
  dismissAccountNudge: () => void;

  // -- prayer
  addPrayer: (data: { title?: string; body: string; category: PrayerCategory }) => Prayer;
  updatePrayer: (prayerId: string, patch: Partial<Pick<Prayer, "title" | "body" | "category">>) => void;
  archivePrayer: (prayerId: string) => void;
  unarchivePrayer: (prayerId: string) => void;
  deletePrayer: (prayerId: string) => void;
  markPrayerAnswered: (prayerId: string, answerReflection?: string) => { newMilestones: MilestoneSeed[] };

  // -- reflection
  addReflection: (data: { body: string; prompt?: string; mood?: ReflectionMood; relatedQuestSlug?: string; relatedVerseReference?: string }) => { reflection: Reflection; newMilestones: MilestoneSeed[] };
  updateReflection: (reflectionId: string, patch: Partial<Pick<Reflection, "body" | "mood" | "prompt">>) => void;
  archiveReflection: (reflectionId: string) => void;
  unarchiveReflection: (reflectionId: string) => void;
  deleteReflection: (reflectionId: string) => void;

  // -- scripture
  toggleBookmark: (bookmark: Omit<VerseBookmark, "id" | "createdAt">) => boolean;
  markChapterRead: (bookSlug: string, bookName: string, chapter: number) => { newMilestones: MilestoneSeed[] };
  setReadingPosition: (position: Omit<ReadingPosition, "updatedAt">) => void;
  /** Record an intentionally viewed verse without retaining duplicates. */
  recordRecentVerse: (verse: Omit<RecentVerse, "viewedAt">) => void;

  // -- daily verse
  /** Refresh today's verse when the active membership tier permits it. */
  refreshVerse: (isPlus?: boolean) => boolean;

  // -- milestones
  dismissPendingMilestone: (key: string) => void;

  // -- sync bookkeeping
  /** Remove tombstone entries the sync engine has propagated remotely. */
  clearSyncTombstones: (cleared: SyncTombstones) => void;
}

function normalizeAssignmentRecord(
  assignments: Record<string, DailyQuestAssignment[]>,
): Record<string, DailyQuestAssignment[]> {
  let changed = false;
  const normalized: Record<string, DailyQuestAssignment[]> = {};
  for (const [dateKey, list] of Object.entries(assignments)) {
    normalized[dateKey] = (list ?? []).map((assignment) => {
      const next = normalizeAssignmentWindow(assignment);
      if (next !== assignment) changed = true;
      return next;
    });
  }
  return changed ? normalized : assignments;
}

function findOpenAssignment(
  assignments: Record<string, DailyQuestAssignment[]>,
  slug: string,
  now: Date | number = Date.now(),
): { dateKey: string; assignment: DailyQuestAssignment } | null {
  for (const [dateKey, list] of Object.entries(assignments)) {
    const assignment = list
      ?.map(normalizeAssignmentWindow)
      .find(
        (candidate) =>
          candidate.questSlug === slug &&
          candidate.status !== "released" &&
          isQuestWindowOpen(candidate, now),
      );
    if (assignment) return { dateKey, assignment };
  }
  return null;
}

function findOccupiedAssignment(
  assignments: Record<string, DailyQuestAssignment[]>,
  slug: string,
  now: Date | number = Date.now(),
): { dateKey: string; assignment: DailyQuestAssignment } | null {
  for (const [dateKey, list] of Object.entries(assignments)) {
    const assignment = list
      ?.map(normalizeAssignmentWindow)
      .find(
        (candidate) =>
          candidate.questSlug === slug && isQuestWindowOpen(candidate, now),
      );
    if (assignment) return { dateKey, assignment };
  }
  return null;
}

function recentVerseKey(
  verse: Pick<RecentVerse, "bookSlug" | "chapter" | "verseStart" | "verseEnd">,
): string {
  return `${verse.bookSlug}:${verse.chapter}:${verse.verseStart}-${verse.verseEnd}`;
}

/**
 * Seed the quest shelf from pre-shelf history (v5→v6 migration and
 * restores of pre-v6 exports): completions become completed entries;
 * unfinished picks from the last week come along as active walks. Older
 * unfinished picks stay in the past — resurfacing a month-old pick as an
 * open obligation is exactly the shame the app avoids.
 */
function deriveMyQuestsFromHistory(
  completions: QuestCompletion[],
  assignments: Record<string, DailyQuestAssignment[]>
): Record<string, MyQuest> {
  const myQuests: Record<string, MyQuest> = {};
  for (const c of completions) {
    const prev = myQuests[c.questSlug];
    myQuests[c.questSlug] = {
      questSlug: c.questSlug,
      status: "completed",
      addedAt:
        prev && prev.addedAt <= c.completedAt ? prev.addedAt : c.completedAt,
      completedAt:
        prev?.completedAt && prev.completedAt >= c.completedAt
          ? prev.completedAt
          : c.completedAt,
      lastActivityAt:
        prev && prev.lastActivityAt >= c.completedAt
          ? prev.lastActivityAt
          : c.completedAt,
      stepsDone: [...QUEST_STEP_KEYS],
      timesCompleted: (prev?.timesCompleted ?? 0) + 1,
    };
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffKey = toDateKey(cutoff);
  for (const [dateKey, picks] of Object.entries(assignments)) {
    if (dateKey < cutoffKey) continue;
    for (const pick of picks ?? []) {
      if (pick.status === "completed" || pick.status === "released") continue;
      if (myQuests[pick.questSlug]?.status === "completed") continue;
      const at =
        pick.startedAt ??
        pick.pickedAt ??
        new Date(`${dateKey}T12:00:00`).toISOString();
      myQuests[pick.questSlug] = {
        questSlug: pick.questSlug,
        status: "active",
        addedAt: at,
        startedAt: pick.startedAt,
        lastActivityAt: at,
        stepsDone: [],
        timesCompleted: 0,
      };
    }
  }
  return myQuests;
}

function journeyTitle(type: JourneyEventType, detail?: string): string {
  switch (type) {
    case "quest_completed":
      return detail ?? "Quest completed";
    case "reflection_written":
      return "Reflection written";
    case "prayer_created":
      return "Prayer written";
    case "prayer_answered":
      return "Prayer answered";
    case "chapter_read":
      return detail ?? "Scripture read";
    case "verse_bookmarked":
      return detail ?? "Verse saved";
    case "milestone_reached":
      return detail ?? "Milestone reached";
  }
}

export const useQuestOS = create<QuestOSState>()(
  persist(
    (set, get) => {
      /** Append a journey event (+ optional growth) and run milestone checks. */
      function recordAction(
        type: JourneyEventType,
        detail: string | undefined,
        growthType: GrowthType | null,
        state = get()
      ): { journey: JourneyEvent; growth: GrowthEvent | null } {
        const now = new Date();
        const journey: JourneyEvent = {
          id: id(),
          type,
          title: journeyTitle(type, detail),
          detail,
          dateKey: toDateKey(now),
          occurredAt: now.toISOString(),
        };
        const growth: GrowthEvent | null = growthType
          ? {
              id: id(),
              growthType,
              amount: 1,
              sourceType: type,
              occurredAt: now.toISOString(),
            }
          : null;
        const prevStreak = get().streak;
        const nextStreak = advanceStreak(prevStreak, journey.dateKey);
        set({
          journeyEvents: [...state.journeyEvents, journey],
          growthEvents: growth
            ? [...state.growthEvents, growth]
            : state.growthEvents,
          // Every meaningful action keeps the candle lit. advanceStreak
          // returns the same reference when today is already counted, so
          // repeat actions don't churn the persisted blob.
          streak: nextStreak,
        });
        // Milestone days only (never every day) — a count, nothing else.
        if (
          nextStreak !== prevStreak &&
          [3, 7, 14, 30, 100, 365].includes(nextStreak.current)
        ) {
          track("streak_milestone", { count: nextStreak.current });
        }
        return { journey, growth };
      }

      function runMilestoneCheck(): MilestoneSeed[] {
        const s = get();
        const metrics = computeMetrics({
          completions: s.completions,
          prayers: s.prayers,
          reflections: s.reflections,
          chaptersRead: s.chaptersRead,
          bookmarks: s.bookmarks,
          journeyEvents: s.journeyEvents,
          questBySlug,
        });
        const fresh = checkMilestones(
          seedMilestones,
          s.earnedMilestones,
          metrics
        );
        if (fresh.length) {
          const now = new Date().toISOString();
          set({
            earnedMilestones: [
              ...s.earnedMilestones,
              ...fresh.map((m) => ({ key: m.key, achievedAt: now })),
            ],
            pendingMilestones: [
              ...s.pendingMilestones,
              ...fresh.map((m) => m.key),
            ],
          });
          for (const m of fresh) {
            recordAction("milestone_reached", m.title, null);
          }
        }
        return fresh;
      }

      /**
       * Upsert a shelf entry, always refreshing lastActivityAt. `patch` wins
       * over the existing entry; new entries start from gentle defaults.
       */
      function touchMyQuest(
        slug: string,
        patch: Partial<Omit<MyQuest, "questSlug">>
      ): void {
        const s = get();
        const now = new Date().toISOString();
        const existing = s.myQuests[slug];
        const entry: MyQuest = existing
          ? { ...existing, ...patch, lastActivityAt: now }
          : {
              questSlug: slug,
              status: "active",
              addedAt: now,
              stepsDone: [],
              timesCompleted: 0,
              ...patch,
              lastActivityAt: now,
            };
        set({ myQuests: { ...s.myQuests, [slug]: entry } });
      }

      /**
       * Hide an unfinished window without turning removal into a free-tier
       * cap bypass. Plus can release freely. A brand-new, unstarted free pick
       * gets a two-minute true undo for accidental taps; after that the row is
       * marked released and invisibly reserves its slot until expiry.
       */
      function releaseQuestWindow(
        slug: string,
        isPlus: boolean,
      ): DailyQuestAssignment | null {
        const s = get();
        const open = findOpenAssignment(s.assignments, slug);
        if (!open || open.assignment.status === "completed") return null;

        const pickedAt = Date.parse(open.assignment.pickedAt);
        const withinUndo =
          open.assignment.status === "assigned" &&
          Number.isFinite(pickedAt) &&
          Date.now() - pickedAt <= QUEST_PICK_UNDO_MS;
        const dayPicks = s.assignments[open.dateKey] ?? [];
        set({
          assignments: {
            ...s.assignments,
            [open.dateKey]:
              isPlus || withinUndo
                ? dayPicks.filter(
                    (assignment) =>
                      assignment.questSlug !== slug ||
                      assignment.status === "completed"
                  )
                : dayPicks.map((assignment) =>
                    assignment.questSlug === slug &&
                    assignment.status !== "completed" &&
                    isQuestWindowOpen(assignment)
                      ? {
                          ...normalizeAssignmentWindow(assignment),
                          status: "released" as const,
                        }
                      : assignment
                  ),
          },
        });
        return open.assignment;
      }

      function completeQuest(
        quest: QuestTemplate,
        reflection?: { body: string; mood?: ReflectionMood }
      ): QuestCompletionResult {
        const s = get();
        const now = new Date();
        const dateKey = toDateKey(now);

        // Completion is only available inside an open 24-hour window. Every
        // UI begin path atomically opens one first, which keeps the free limit
        // a domain rule instead of a presentation-only suggestion.
        const openPick = findOpenAssignment(s.assignments, quest.slug, now);
        if (!openPick) {
          return {
            completed: false,
            newMilestones: [],
            reason: "window_closed",
          };
        }
        if (openPick.assignment.status === "completed") {
          return {
            completed: false,
            newMilestones: [],
            reason: "already_completed",
          };
        }

        // Legacy/imported histories may contain a completion without a matching
        // completed assignment. Keep the append-only growth log idempotent.
        if (
          s.completions.some(
            (c) =>
              c.questSlug === quest.slug &&
              c.completedAt >= openPick.assignment.pickedAt &&
              c.completedAt < openPick.assignment.expiresAt,
          )
        ) {
          return {
            completed: false,
            newMilestones: [],
            reason: "already_completed",
          };
        }

        // Completion is a transition from an underway quest, never directly
        // from a merely assigned card. This also closes non-UI bypasses.
        if (openPick.assignment.status !== "started") {
          return {
            completed: false,
            newMilestones: [],
            reason: "not_started",
          };
        }

        // The disabled button is guidance; this domain guard is authority.
        // Generic steps stay optional unless content explicitly supplies a
        // checklist for this quest.
        if (!isQuestChecklistComplete(quest, s.myQuests[quest.slug])) {
          return {
            completed: false,
            newMilestones: [],
            reason: "checklist_incomplete",
          };
        }

        let reflectionId: string | undefined;
        if (reflection?.body.trim()) {
          const r: Reflection = {
            id: id(),
            prompt: quest.reflectionPrompt,
            body: reflection.body.trim(),
            mood: reflection.mood,
            relatedQuestSlug: quest.slug,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          set({ reflections: [...get().reflections, r] });
          reflectionId = r.id;
          recordAction("reflection_written", undefined, "sunlight");
          track("reflection_created");
        }

        const completion: QuestCompletion = {
          id: id(),
          questSlug: quest.slug,
          dateKey,
          completedAt: now.toISOString(),
          reflectionId,
        };
        set({ completions: [...get().completions, completion] });

        // The assignment belongs to the day it was picked, even when its
        // rolling window crosses midnight.
        const pickDayKey = openPick.dateKey;
        set({
          assignments: {
            ...get().assignments,
            [pickDayKey]: (get().assignments[pickDayKey] ?? []).map((a) =>
              a.questSlug === quest.slug && isQuestWindowOpen(a, now)
                ? {
                    ...normalizeAssignmentWindow(a),
                    status: "completed" as const,
                    completedAt: now.toISOString(),
                  }
                : a
            ),
          },
        });

        // The shelf entry finishes with the quest — every step done, one
        // more completion on the record. "Begin without adding" walks land
        // here too, creating the entry so the feed still remembers them.
        touchMyQuest(quest.slug, {
          status: "completed",
          stepsDone: [...QUEST_STEP_KEYS],
          completedAt: now.toISOString(),
          timesCompleted: (get().myQuests[quest.slug]?.timesCompleted ?? 0) + 1,
          pausedAt: undefined,
          archivedAt: undefined,
        });

        recordAction("quest_completed", quest.title, quest.growthType);
        track("quest_completed", { category: quest.category });
        return { completed: true, newMilestones: runMilestoneCheck() };
      }

      return {
        profile: null,
        settings: DEFAULT_SETTINGS,
        assignments: {},
        myQuests: {},
        completions: [],
        prayers: [],
        reflections: [],
        journeyEvents: [],
        growthEvents: [],
        earnedMilestones: [],
        bookmarks: [],
        readingPosition: null,
        chaptersRead: [],
        recentVerses: [],
        pendingMilestones: [],
        lastVisitDateKey: null,
        streak: emptyStreak(),
        verseRefresh: null,
        accountNudge: emptyAccountNudge(),
        tombstones: emptyTombstones(),

        completeOnboarding: (profileData, settingsPatch) => {
          const now = new Date().toISOString();
          set({
            profile: {
              ...profileData,
              onboardingCompleted: true,
              createdAt: now,
            },
            settings: { ...get().settings, ...settingsPatch },
          });
          track("onboarding_completed");
        },

        updateProfile: (patch) => {
          const profile = get().profile;
          if (!profile) return;
          set({ profile: { ...profile, ...patch } });
        },

        updateSettings: (patch) => {
          set({ settings: { ...get().settings, ...patch } });
          // Mirror consent to its own storage key so events fired before
          // the store hydrates still honor the last known choice.
          if (patch.analyticsConsent != null) {
            setAnalyticsConsent(patch.analyticsConsent);
          }
        },

        recordVisit: () => {
          set({ lastVisitDateKey: toDateKey() });
        },

        clearAllData: (opts) => {
          set({
            profile: null,
            settings: DEFAULT_SETTINGS,
            assignments: {},
            myQuests: {},
            completions: [],
            prayers: [],
            reflections: [],
            journeyEvents: [],
            growthEvents: [],
            earnedMilestones: [],
            bookmarks: [],
            readingPosition: null,
            chaptersRead: [],
            recentVerses: [],
            pendingMilestones: [],
            lastVisitDateKey: null,
            streak: emptyStreak(),
            verseRefresh: null,
            accountNudge: emptyAccountNudge(),
            // The purge marker survives the reset (it IS the reset's remote
            // half); it subsumes any pending per-row tombstones.
            tombstones: {
              ...emptyTombstones(),
              purgeAccount: opts?.purgeAccount ?? null,
            },
          });
          // track() enforces the localStorage mirror, not the store — keep
          // them in lockstep or the Settings toggle and reality disagree.
          setAnalyticsConsent(DEFAULT_SETTINGS.analyticsConsent);
        },

        importData: (snapshot, opts) => {
          // REPLACE (a restore, not a merge): start from clean defaults so
          // nothing from the current journey bleeds through, then overlay the
          // validated snapshot. Any omitted field keeps its default. Emits no
          // analytics — imported prayer/reflection text stays on-device.
          set({
            profile: snapshot.profile ?? null,
            settings: snapshot.settings
              ? {
                  ...DEFAULT_SETTINGS,
                  ...snapshot.settings,
                  appearance: {
                    ...DEFAULT_SETTINGS.appearance,
                    ...(snapshot.settings.appearance ?? {}),
                  },
                }
              : DEFAULT_SETTINGS,
            assignments: normalizeAssignmentRecord(snapshot.assignments ?? {}),
            // Pre-v6 exports carry no shelf — seed it from their history
            // exactly like the storage migration does.
            myQuests:
              snapshot.myQuests ??
              deriveMyQuestsFromHistory(
                snapshot.completions ?? [],
                snapshot.assignments ?? {}
              ),
            completions: snapshot.completions ?? [],
            prayers: (snapshot.prayers ?? []).map(normalizePrayerArchive),
            reflections: snapshot.reflections ?? [],
            journeyEvents: snapshot.journeyEvents ?? [],
            growthEvents: snapshot.growthEvents ?? [],
            earnedMilestones: snapshot.earnedMilestones ?? [],
            bookmarks: snapshot.bookmarks ?? [],
            readingPosition: snapshot.readingPosition ?? null,
            chaptersRead: snapshot.chaptersRead ?? [],
            recentVerses: snapshot.recentVerses ?? [],
            pendingMilestones: snapshot.pendingMilestones ?? [],
            lastVisitDateKey: snapshot.lastVisitDateKey ?? null,
            streak: snapshot.streak ?? emptyStreak(),
            // Device-local like the streak: the sync engine's merge-apply
            // passes the local value through; old exports just reset it.
            accountNudge: snapshot.accountNudge ?? emptyAccountNudge(),
            // Device-local and day-scoped — survives restores and the sync
            // engine's merge-apply alike; self-resets at the next midnight.
            verseRefresh: get().verseRefresh,
            // A signed-in restore condemns the account copy: the purge marker
            // makes the sync engine delete the remote rows and rebuild them
            // from this snapshot instead of merging the old copy back in. It
            // subsumes any pending per-row tombstones. Without opts (guest
            // restore, or the engine applying a merge) tombstones are left
            // untouched.
            ...(opts?.purgeAccount
              ? {
                  tombstones: {
                    ...emptyTombstones(),
                    purgeAccount: opts.purgeAccount,
                  },
                }
              : {}),
          });
          // Mirror the (possibly imported/merged) consent choice — track()
          // reads the mirror, so a restored opt-out must land there too.
          setAnalyticsConsent(get().settings.analyticsConsent);
        },

        pickQuest: (slug, isPlus = false) => {
          const s = get();
          if (!questBySlug.has(slug)) return false;
          const occupied = findOccupiedAssignment(s.assignments, slug);
          if (occupied) {
            // A free member may hide a quest without releasing its slot. If
            // they change their mind, restore that same reservation instead
            // of trapping the quest or charging a second slot.
            if (occupied.assignment.status !== "released") return false;
            set({
              assignments: {
                ...s.assignments,
                [occupied.dateKey]: (s.assignments[occupied.dateKey] ?? []).map(
                  (assignment) =>
                    assignment.questSlug === slug &&
                    assignment.status === "released" &&
                    isQuestWindowOpen(assignment)
                      ? {
                          ...normalizeAssignmentWindow(assignment),
                          status: "assigned" as const,
                        }
                      : assignment
                ),
              },
            });
            touchMyQuest(slug, { status: "active", pausedAt: undefined });
            track("quest_picked");
            return true;
          }
          if (questSlotsRemaining(s.assignments, isPlus) <= 0) return false;

          const dateKey = toDateKey();
          const dayPicks = s.assignments[dateKey] ?? [];
          // The database natural key is (user, day, slug). A same-day expired
          // duplicate is only possible after clock/time-zone manipulation; fail
          // closed rather than creating a row that cannot sync.
          if (dayPicks.some((a) => a.questSlug === slug)) return false;
          const nowDate = new Date();
          const now = nowDate.toISOString();
          const expiresAt = new Date(nowDate.getTime() + QUEST_WINDOW_MS).toISOString();
          set({
            assignments: {
              ...s.assignments,
              [dateKey]: [
                ...dayPicks,
                {
                  dateKey,
                  questSlug: slug,
                  status: "assigned" as const,
                  pickedAt: now,
                  expiresAt,
                  rerolls: 0,
                },
              ],
            },
          });
          // Picking puts (or wakes) the quest on the shelf. Re-picking a
          // finished quest is walking it again — fresh steps, the lifetime
          // count stays. addedAt aligning with pickedAt marks entries born
          // from this pick, so an immediate unpick can tidy up after itself.
          const shelfEntry = get().myQuests[slug];
          if (shelfEntry?.status === "completed" || shelfEntry?.status === "archived") {
            touchMyQuest(slug, {
              status: "active",
              stepsDone: [],
              startedAt: undefined,
              pausedAt: undefined,
              archivedAt: undefined,
            });
          } else {
            touchMyQuest(slug, {
              status: "active",
              pausedAt: undefined,
              ...(shelfEntry ? {} : { addedAt: now }),
            });
          }
          track("quest_picked");
          return true;
        },

        unpickQuest: (slug, isPlus = false) => {
          const s = get();
          const open = findOpenAssignment(s.assignments, slug);
          if (!open) return;
          const { assignment: target } = open;
          // Completed picks are part of the record — they don't come off.
          if (target.status === "completed") return;
          releaseQuestWindow(slug, isPlus);
          // Tidy the shelf: an entry born from this very pick (addedAt ===
          // pickedAt) that was never begun leaves with it — the person was
          // browsing, not committing. Removal must tombstone or sync
          // resurrects the row. Older un-begun entries restore their prior
          // standing: a re-picked completed quest returns to the completed
          // record (its walks aren't erased by a change of heart about
          // today), anything else goes back to saved-for-later. A walk
          // that's already begun stays active. After the accidental-tap
          // grace, free-tier removal hides the quest but keeps its slot
          // reservation until the rolling window ends.
          const entry = get().myQuests[slug];
          if (entry && entry.status === "active") {
            const begun = entry.stepsDone.length > 0 || Boolean(entry.startedAt);
            const bornFromPick = entry.addedAt === target.pickedAt && !begun;
            if (bornFromPick) {
              const rest = { ...get().myQuests };
              delete rest[slug];
              const t = get().tombstones;
              set({
                myQuests: rest,
                tombstones: { ...t, myQuests: [...t.myQuests, slug] },
              });
            } else if (!begun) {
              touchMyQuest(slug, {
                status: entry.timesCompleted > 0 ? "completed" : "saved",
                ...(entry.timesCompleted > 0
                  ? { stepsDone: [...QUEST_STEP_KEYS] }
                  : {}),
              });
            }
          }
          track("quest_unpicked");
        },

        startQuest: (slug, isPlus = false) => {
          let open = findOpenAssignment(get().assignments, slug);
          if (!open) {
            if (!get().pickQuest(slug, isPlus)) return false;
            open = findOpenAssignment(get().assignments, slug);
          }
          if (!open || open.assignment.status === "completed") return false;

          const now = new Date().toISOString();
          if (open.assignment.status === "assigned") {
            const s = get();
            const dayPicks = s.assignments[open.dateKey] ?? [];
            set({
              assignments: {
                ...s.assignments,
                [open.dateKey]: dayPicks.map((a) =>
                  a.questSlug === slug && isQuestWindowOpen(a)
                    ? {
                        ...normalizeAssignmentWindow(a),
                        status: "started" as const,
                        startedAt: now,
                      }
                    : a
                ),
              },
            });
            track("quest_started");
          }
          touchMyQuest(slug, {
            status: "active",
            pausedAt: undefined,
            ...(get().myQuests[slug]?.startedAt
              ? {}
              : { startedAt: now }),
          });
          return true;
        },

        completeQuestBySlug: (slug, reflection) => {
          const quest = questBySlug.get(slug);
          if (!quest) {
            return {
              completed: false,
              newMilestones: [],
              reason: "unknown_quest",
            };
          }
          return completeQuest(quest, reflection);
        },

        saveQuestForLater: (slug) => {
          if (!questBySlug.has(slug)) return false;
          const entry = get().myQuests[slug];
          // Underway or finished walks have nothing to "save" — resume,
          // pause, or reopen are their moves.
          if (
            entry &&
            (entry.status === "completed" ||
              entry.status === "archived" ||
              (entry.status === "active" &&
                (entry.stepsDone.length > 0 || entry.startedAt)))
          ) {
            return false;
          }
          if (entry?.status === "saved") return false;
          touchMyQuest(slug, { status: "saved", pausedAt: undefined });
          track("quest_saved");
          return true;
        },

        pauseQuest: (slug) => {
          const entry = get().myQuests[slug];
          if (!entry || entry.status !== "active") return;
          touchMyQuest(slug, {
            status: "paused",
            pausedAt: new Date().toISOString(),
          });
          track("quest_paused");
        },

        resumeQuest: (slug) => {
          const entry = get().myQuests[slug];
          if (!entry || (entry.status !== "paused" && entry.status !== "saved"))
            return;
          touchMyQuest(slug, { status: "active", pausedAt: undefined });
          track("quest_resumed");
        },

        archiveQuest: (slug, isPlus = false) => {
          const s = get();
          const entry = s.myQuests[slug];
          if (!entry || entry.status === "archived") return;
          touchMyQuest(slug, {
            status: "archived",
            archivedAt: new Date().toISOString(),
            pausedAt: undefined,
          });
          releaseQuestWindow(slug, isPlus);
          track("quest_archived");
        },

        removeQuest: (slug, isPlus = false) => {
          const s = get();
          if (!s.myQuests[slug]) return;
          const rest = { ...s.myQuests };
          delete rest[slug];
          set({
            myQuests: rest,
            // Tombstone the slug or the account copy resurrects it on the
            // next merge. The quest itself stays in Browse, always.
            tombstones: {
              ...s.tombstones,
              myQuests: [...s.tombstones.myQuests, slug],
            },
          });
          releaseQuestWindow(slug, isPlus);
          track("quest_removed");
        },

        reopenQuest: (slug) => {
          const entry = get().myQuests[slug];
          if (
            !entry ||
            (entry.status !== "completed" && entry.status !== "archived")
          )
            return;
          touchMyQuest(slug, {
            status: "active",
            stepsDone: [],
            startedAt: undefined,
            pausedAt: undefined,
            archivedAt: undefined,
            // completedAt and timesCompleted stay — the record of past
            // walks is part of the journey, not something a reopen erases.
          });
          track("quest_reopened");
        },

        markQuestStep: (slug, step, done = true) => {
          if (!questBySlug.has(slug)) return;
          const entry = get().myQuests[slug];
          // Finished walks don't un-tick; reopen starts a fresh one.
          if (entry?.status === "completed" || entry?.status === "archived")
            return;
          if (!entry && !done) return;
          const current = new Set(entry?.stepsDone ?? []);
          if (entry && done === current.has(step)) return;
          if (done) current.add(step);
          else current.delete(step);
          // Ordered by the canonical walk, not tap order, so progress
          // renders steadily.
          const stepsDone = QUEST_STEP_KEYS.filter((k) => current.has(k));
          touchMyQuest(slug, {
            status: "active",
            pausedAt: undefined,
            stepsDone,
            ...(entry?.startedAt || stepsDone.length === 0
              ? {}
              : { startedAt: new Date().toISOString() }),
          });
          if (done) track("quest_step_completed", { step });
        },

        markAccountNudgeShown: (context) => {
          const nudge = get().accountNudge;
          if (nudge.shownContexts.includes(context)) return;
          set({
            accountNudge: {
              ...nudge,
              shownContexts: [...nudge.shownContexts, context],
            },
          });
        },

        dismissAccountNudge: () => {
          const nudge = get().accountNudge;
          set({
            accountNudge: {
              ...nudge,
              lastDismissedAt: new Date().toISOString(),
              dismissCount: nudge.dismissCount + 1,
            },
          });
        },

        addPrayer: (data) => {
          const now = new Date().toISOString();
          const prayer: Prayer = {
            id: id(),
            title: data.title?.trim() || undefined,
            body: data.body.trim(),
            category: data.category,
            status: "active",
            createdAt: now,
            updatedAt: now,
          };
          set({ prayers: [...get().prayers, prayer] });
          recordAction("prayer_created", undefined, "roots");
          track("prayer_created");
          runMilestoneCheck();
          return prayer;
        },

        updatePrayer: (prayerId, patch) => {
          set({
            prayers: get().prayers.map((p) =>
              p.id === prayerId
                ? { ...p, ...patch, updatedAt: new Date().toISOString() }
                : p
            ),
          });
        },

        archivePrayer: (prayerId) => {
          const now = new Date().toISOString();
          set({
            prayers: get().prayers.map((p) =>
              p.id === prayerId
                ? { ...p, archivedAt: now, updatedAt: now }
                : p
            ),
          });
        },

        unarchivePrayer: (prayerId) => {
          const now = new Date().toISOString();
          set({
            prayers: get().prayers.map((p) =>
              p.id === prayerId
                ? {
                    ...p,
                    // Old clients encoded archive inside status. Recover the
                    // most specific state the surviving fields can prove.
                    status:
                      p.status === "archived"
                        ? p.answeredAt
                          ? "answered"
                          : "active"
                        : p.status,
                    archivedAt: undefined,
                    updatedAt: now,
                  }
                : p
            ),
          });
        },

        deletePrayer: (prayerId) => {
          const s = get();
          set({
            prayers: s.prayers.filter((p) => p.id !== prayerId),
            tombstones: {
              ...s.tombstones,
              prayers: [...s.tombstones.prayers, prayerId],
            },
          });
        },

        markPrayerAnswered: (prayerId, answerReflection) => {
          const target = get().prayers.find((p) => p.id === prayerId);
          // Guard double-taps: answering an already-answered prayer must not
          // append a second growth/journey event.
          if (!target || target.status === "answered") {
            return { newMilestones: [] };
          }
          const now = new Date().toISOString();
          set({
            prayers: get().prayers.map((p) =>
              p.id === prayerId
                ? {
                    ...p,
                    status: "answered" as const,
                    answeredAt: now,
                    answerReflection: answerReflection?.trim() || undefined,
                    updatedAt: now,
                  }
                : p
            ),
          });
          recordAction("prayer_answered", undefined, "flowers");
          track("prayer_answered");
          return { newMilestones: runMilestoneCheck() };
        },

        addReflection: (data) => {
          const now = new Date().toISOString();
          const reflection: Reflection = {
            id: id(),
            prompt: data.prompt,
            body: data.body.trim(),
            mood: data.mood,
            relatedQuestSlug: data.relatedQuestSlug,
            relatedVerseReference: data.relatedVerseReference,
            createdAt: now,
            updatedAt: now,
          };
          set({ reflections: [...get().reflections, reflection] });
          recordAction("reflection_written", undefined, "sunlight");
          track("reflection_created");
          return { reflection, newMilestones: runMilestoneCheck() };
        },

        updateReflection: (reflectionId, patch) => {
          set({
            reflections: get().reflections.map((r) =>
              r.id === reflectionId
                ? { ...r, ...patch, updatedAt: new Date().toISOString() }
                : r
            ),
          });
        },

        archiveReflection: (reflectionId) => {
          const now = new Date().toISOString();
          set({
            reflections: get().reflections.map((reflection) =>
              reflection.id === reflectionId
                ? { ...reflection, archivedAt: now, updatedAt: now }
                : reflection,
            ),
          });
        },

        unarchiveReflection: (reflectionId) => {
          const now = new Date().toISOString();
          set({
            reflections: get().reflections.map((reflection) =>
              reflection.id === reflectionId
                ? { ...reflection, archivedAt: undefined, updatedAt: now }
                : reflection,
            ),
          });
        },

        deleteReflection: (reflectionId) => {
          const s = get();
          set({
            reflections: s.reflections.filter((r) => r.id !== reflectionId),
            tombstones: {
              ...s.tombstones,
              reflections: [...s.tombstones.reflections, reflectionId],
            },
          });
        },

        toggleBookmark: (bookmark) => {
          const s = get();
          const translationKey = bookmark.translationKey ?? "web";
          const existing = s.bookmarks.find(
            (b) =>
              b.bookSlug === bookmark.bookSlug &&
              b.chapter === bookmark.chapter &&
              b.verse === bookmark.verse &&
              (b.translationKey ?? "web") === translationKey
          );
          if (existing) {
            set({
              bookmarks: s.bookmarks.filter((b) => b.id !== existing.id),
              tombstones: {
                ...s.tombstones,
                bookmarks: [
                  ...s.tombstones.bookmarks,
                  {
                    bookSlug: existing.bookSlug,
                    chapter: existing.chapter,
                    verse: existing.verse,
                    translationKey: existing.translationKey ?? "web",
                  },
                ],
              },
            });
            return false;
          }
          const created: VerseBookmark = {
            ...bookmark,
            translationKey,
            id: id(),
            createdAt: new Date().toISOString(),
          };
          set({ bookmarks: [...s.bookmarks, created] });
          recordAction(
            "verse_bookmarked",
            `${bookmark.bookName} ${bookmark.chapter}:${bookmark.verse}`,
            null
          );
          track("verse_bookmarked");
          runMilestoneCheck();
          return true;
        },

        markChapterRead: (bookSlug, bookName, chapter) => {
          const s = get();
          const dateKey = toDateKey();
          const already = s.chaptersRead.some(
            (c) => c.bookSlug === bookSlug && c.chapter === chapter
          );
          // Only record a chapter once — re-opening it must not grow the
          // persisted array or re-fire growth for the same reading.
          if (!already) {
            set({
              chaptersRead: [...s.chaptersRead, { bookSlug, chapter, dateKey }],
            });
            recordAction("chapter_read", `${bookName} ${chapter}`, "branches");
          }
          track("bible_chapter_opened");
          return { newMilestones: already ? [] : runMilestoneCheck() };
        },

        setReadingPosition: (position) => {
          set({
            readingPosition: {
              ...position,
              updatedAt: new Date().toISOString(),
            },
          });
        },

        recordRecentVerse: (verse) => {
          const key = recentVerseKey(verse);
          const current = get().recentVerses;

          // Revisiting the passage already at the front of history is a no-op;
          // avoiding a full persisted-store rewrite keeps Bible entry smooth.
          if (current[0] && recentVerseKey(current[0]) === key) return;

          const now = new Date().toISOString();
          const next: RecentVerse = { ...verse, viewedAt: now };
          set({
            recentVerses: [
              next,
              ...current.filter(
                (candidate) => recentVerseKey(candidate) !== key,
              ),
            ].slice(0, 20),
          });
        },

        dismissPendingMilestone: (key) => {
          set({
            pendingMilestones: get().pendingMilestones.filter(
              (k) => k !== key
            ),
          });
        },

        refreshVerse: (isPlus = false) => {
          const dateKey = toDateKey();
          const prev = get().verseRefresh;
          const count = prev?.dateKey === dateKey ? prev.count : 0;

          // Enforce the free allowance in the data layer as well as the UI so
          // a stale or duplicated button cannot spend a fourth refresh.
          if (!canRefreshDailyVerse(count, isPlus)) return false;

          set({
            verseRefresh: {
              dateKey,
              // Yesterday's count doesn't carry — a new day starts at its
              // own daily verse and refreshes from there.
              count: count + 1,
            },
          });
          return true;
        },

        clearSyncTombstones: (cleared) => {
          // No-op when nothing can change — writing a fresh tombstones
          // object would wake the sync subscriber for no reason.
          if (
            !cleared.prayers.length &&
            !cleared.reflections.length &&
            !cleared.bookmarks.length &&
            !cleared.myQuests.length &&
            !cleared.purgeAccount
          ) {
            return;
          }
          const t = get().tombstones;
          set({
            tombstones: {
              prayers: t.prayers.filter((id) => !cleared.prayers.includes(id)),
              reflections: t.reflections.filter(
                (id) => !cleared.reflections.includes(id)
              ),
              bookmarks: t.bookmarks.filter(
                (b) =>
                  !cleared.bookmarks.some(
                    (c) =>
                      c.bookSlug === b.bookSlug &&
                      c.chapter === b.chapter &&
                      c.verse === b.verse &&
                      (c.translationKey ?? "web") ===
                        (b.translationKey ?? "web")
                  )
              ),
              myQuests: t.myQuests.filter(
                (slug) => !cleared.myQuests.includes(slug)
              ),
              // Only the exact purge that propagated clears — a marker for a
              // different account stays pending until that user signs in.
              purgeAccount:
                t.purgeAccount && t.purgeAccount === cleared.purgeAccount
                  ? null
                  : t.purgeAccount,
            },
          });
        },
      };
    },
    {
      name: "biblequest:v1",
      storage: createJSONStorage(() => localStorage),
      version: 11,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // v2 adds sync tombstones.
          state.tombstones = emptyTombstones();
        }
        if (version < 3) {
          // v3 also introduces the UI language preference.
          const settings = state.settings as Record<string, unknown> | undefined;
          if (settings && typeof settings === "object" && !settings.language) {
            settings.language = "en";
          }
          // v3: pick model — each day holds an ARRAY of picked quests
          // (was a single assigned quest). Wrap old values; drop garbage.
          const old = state.assignments;
          const next: Record<string, DailyQuestAssignment[]> = {};
          if (old && typeof old === "object" && !Array.isArray(old)) {
            for (const [key, value] of Object.entries(old)) {
              if (Array.isArray(value)) {
                next[key] = value as DailyQuestAssignment[];
              } else if (value && typeof value === "object") {
                next[key] = [value as DailyQuestAssignment];
              }
            }
          }
          state.assignments = next;
        }
        if (version < 4) {
          // v4 adds the account-purge marker to tombstones.
          state.tombstones = {
            ...emptyTombstones(),
            ...(state.tombstones as Partial<SyncTombstones> | undefined),
          };
        }
        if (version < 5) {
          // v5: candle streak + same-day verse refresh + bold-text setting.
          state.streak = emptyStreak();
          state.verseRefresh = null;
          const settings = state.settings as
            | { appearance?: Record<string, unknown> }
            | undefined;
          if (settings?.appearance && settings.appearance.boldText == null) {
            settings.appearance.boldText = false;
          }
        }
        if (version < 6) {
          // v6: the quest shelf (My Quests), account-nudge bookkeeping,
          // shelf tombstones, and the analytics-consent setting.
          state.accountNudge = emptyAccountNudge();
          state.tombstones = {
            ...emptyTombstones(),
            ...(state.tombstones as Partial<SyncTombstones> | undefined),
            myQuests: [],
          };
          const settings = state.settings as
            | { analyticsConsent?: boolean }
            | undefined;
          if (settings && settings.analyticsConsent == null) {
            settings.analyticsConsent = true;
          }

          // Seed the shelf from history so existing journeys arrive with a
          // living feed instead of an empty one.
          state.myQuests = deriveMyQuestsFromHistory(
            (state.completions ?? []) as QuestCompletion[],
            (state.assignments ?? {}) as Record<string, DailyQuestAssignment[]>
          );
        }
        if (version < 7) {
          // Earlier releases treated a missing consent record as permission.
          // Because an existing `true` cannot be distinguished from that old
          // default, require every user to make a fresh explicit choice.
          const settings = state.settings as
            | { analyticsConsent?: boolean }
            | undefined;
          if (settings) settings.analyticsConsent = false;
        }
        if (version < 8) {
          // v8: rolling 24-hour quest windows and persistent recent verses.
          state.assignments = normalizeAssignmentRecord(
            (state.assignments ?? {}) as Record<
              string,
              DailyQuestAssignment[]
            >,
          );
          state.recentVerses = [];
        }
        if (version < 9) {
          // v9: preferred Bible edition. Use the current product default for
          // devices that never had a preference; never replace a real choice.
          const settings = state.settings as
            | { preferredBibleTranslation?: string }
            | undefined;
          if (settings && !settings.preferredBibleTranslation) {
            settings.preferredBibleTranslation =
              DEFAULT_BIBLE_TRANSLATION_KEY;
          }
          // Every pre-v9 bookmark snapshot is exact bundled WEB text.
          state.bookmarks = ((state.bookmarks ?? []) as VerseBookmark[]).map(
            (bookmark) => ({
              ...bookmark,
              translationKey: bookmark.translationKey ?? "web",
            }),
          );
        }
        if (version < 10) {
          // Archive used to overwrite prayer status. Make it orthogonal so an
          // answered prayer stays answered after archive and restore.
          state.prayers = ((state.prayers ?? []) as Prayer[]).map(
            normalizePrayerArchive,
          );
        }
        if (version < 11) {
          // v11 adds device-local wallpaper and glass preferences. Invalid
          // legacy/imported values resolve to the safe free still defaults.
          const settings = state.settings as
            | { appearance?: unknown }
            | undefined;
          if (settings && typeof settings === "object") {
            const appearance =
              settings.appearance &&
              typeof settings.appearance === "object" &&
              !Array.isArray(settings.appearance)
                ? (settings.appearance as Record<string, unknown>)
                : {};
            settings.appearance = {
              ...DEFAULT_SETTINGS.appearance,
              ...appearance,
              wallpaperId:
                appearance.wallpaperId === "none" ||
                isWallpaperId(appearance.wallpaperId)
                  ? appearance.wallpaperId
                  : DEFAULT_WALLPAPER_ID,
              wallpaperMode:
                appearance.wallpaperMode === "live" ? "live" : "still",
              glassSurfaces: appearance.glassSurfaces !== false,
            };
          } else {
            state.settings = DEFAULT_SETTINGS;
          }
        }
        return state as unknown as QuestOSState;
      },
      onRehydrateStorage: () => (state, error) => {
        // A failed or incomplete hydration is not consent. Mirroring here also
        // prevents events fired early in app startup from seeing stale state.
        setAnalyticsConsent(!error && state?.settings.analyticsConsent === true);
      },
    }
  )
);

// ---------------------------------------------------------------------------
// Derived selectors
//
// IMPORTANT: selectors passed to useQuestOS(...) must return a STABLE reference
// (primitive or an unchanged object). Anything that builds a new object/array
// each call (e.g. calculateTreeState, sorted timelines) must be derived with
// useMemo in the component over the raw state slice — never inside a selector,
// or zustand's getSnapshot loops. selectVerseRefreshCount is safe because it
// returns a primitive.
// ---------------------------------------------------------------------------

/** The candle. Stable reference — the stored object itself. */
export function selectStreak(s: QuestOSState): StreakState {
  return s.streak;
}

/**
 * The quest shelf. Stable reference — the stored map itself. Derive
 * ordering/sections with buildQuestFeed inside useMemo (never here).
 */
export function selectMyQuests(s: QuestOSState): Record<string, MyQuest> {
  return s.myQuests;
}

/** Account-nudge bookkeeping. Stable reference — the stored object. */
export function selectAccountNudge(s: QuestOSState): AccountNudgeState {
  return s.accountNudge;
}

/** Today's "Another verse" count (primitive — render-safe). */
export function selectVerseRefreshCount(s: QuestOSState): number {
  const r = s.verseRefresh;
  return r && r.dateKey === toDateKey() ? r.count : 0;
}

export { FREE_QUEST_SLOTS };
