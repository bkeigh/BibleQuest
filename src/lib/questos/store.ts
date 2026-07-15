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
import { getDailyVerse } from "./verse-engine";
import { MAX_DAILY_PICKS } from "./quest-engine";
import { computeMetrics, checkMilestones } from "./milestone-engine";
import { toDateKey, daysBetween } from "@/lib/utils/dates";
import { track, setAnalyticsConsent } from "@/lib/analytics/events";
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
  type QuestStepKey,
  type QuestTemplate,
  type ReadingPosition,
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

interface QuestOSState {
  profile: Profile | null;
  settings: Settings;
  /** Per-day picked quests, up to MAX_DAILY_PICKS per dateKey. */
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

  // -- daily loop (pick model: the user chooses up to MAX_DAILY_PICKS a day)
  /** Add a quest to today. Returns false when the day is full or already picked. */
  pickQuest: (slug: string) => boolean;
  /** Remove an uncompleted quest from today. Completed picks stay. */
  unpickQuest: (slug: string) => void;
  /** Mark a picked quest as underway. */
  startQuest: (slug: string) => void;
  completeQuestBySlug: (slug: string, reflection?: { body: string; mood?: ReflectionMood }) => { newMilestones: MilestoneSeed[] };

  // -- quest shelf (My Quests — persistent, independent of the day)
  /** Tuck a quest away for another day. Returns false when it's already
   *  underway or finished (nothing to save). */
  saveQuestForLater: (slug: string) => boolean;
  /** Set an active quest down without losing its steps. */
  pauseQuest: (slug: string) => void;
  /** Take a saved or paused quest back up. */
  resumeQuest: (slug: string) => void;
  /** Keep the record, out of the main feed. Also frees today's pick. */
  archiveQuest: (slug: string) => void;
  /** Take the quest off the shelf entirely (it stays in Browse). */
  removeQuest: (slug: string) => void;
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
  updateReflection: (reflectionId: string, patch: Partial<Pick<Reflection, "body" | "mood">>) => void;
  deleteReflection: (reflectionId: string) => void;

  // -- scripture
  toggleBookmark: (bookmark: Omit<VerseBookmark, "id" | "createdAt">) => boolean;
  markChapterRead: (bookSlug: string, bookName: string, chapter: number) => { newMilestones: MilestoneSeed[] };
  setReadingPosition: (position: Omit<ReadingPosition, "updatedAt">) => void;

  // -- daily verse
  /** Deterministically show a different verse for the rest of today. */
  refreshVerse: () => void;

  // -- milestones
  dismissPendingMilestone: (key: string) => void;

  // -- sync bookkeeping
  /** Remove tombstone entries the sync engine has propagated remotely. */
  clearSyncTombstones: (cleared: SyncTombstones) => void;
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
      if (pick.status === "completed") continue;
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

      function completeQuest(
        quest: QuestTemplate,
        reflection?: { body: string; mood?: ReflectionMood }
      ): { newMilestones: MilestoneSeed[] } {
        const s = get();
        const now = new Date();
        const dateKey = toDateKey(now);

        // Idempotency: a fast double-tap (or re-entry) must never double-count
        // growth. Growth only ever appends, so guard on an existing completion
        // for this quest today.
        if (
          s.completions.some(
            (c) => c.dateKey === dateKey && c.questSlug === quest.slug
          )
        ) {
          return { newMilestones: [] };
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

        // Mark the matching pick completed. Check today first; if the quest
        // was picked before midnight and finished after, complete it under
        // its own day so yesterday's pick isn't stranded as "started".
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const pickDayKey = [dateKey, toDateKey(yesterday)].find((key) =>
          s.assignments[key]?.some(
            (a) => a.questSlug === quest.slug && a.status !== "completed"
          )
        );
        if (pickDayKey) {
          set({
            assignments: {
              ...get().assignments,
              [pickDayKey]: (get().assignments[pickDayKey] ?? []).map((a) =>
                a.questSlug === quest.slug && a.status !== "completed"
                  ? {
                      ...a,
                      status: "completed" as const,
                      completedAt: now.toISOString(),
                    }
                  : a
              ),
            },
          });
        }

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
        return { newMilestones: runMilestoneCheck() };
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
            assignments: snapshot.assignments ?? {},
            // Pre-v6 exports carry no shelf — seed it from their history
            // exactly like the storage migration does.
            myQuests:
              snapshot.myQuests ??
              deriveMyQuestsFromHistory(
                snapshot.completions ?? [],
                snapshot.assignments ?? {}
              ),
            completions: snapshot.completions ?? [],
            prayers: snapshot.prayers ?? [],
            reflections: snapshot.reflections ?? [],
            journeyEvents: snapshot.journeyEvents ?? [],
            growthEvents: snapshot.growthEvents ?? [],
            earnedMilestones: snapshot.earnedMilestones ?? [],
            bookmarks: snapshot.bookmarks ?? [],
            readingPosition: snapshot.readingPosition ?? null,
            chaptersRead: snapshot.chaptersRead ?? [],
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

        pickQuest: (slug) => {
          const s = get();
          const dateKey = toDateKey();
          const dayPicks = s.assignments[dateKey] ?? [];
          if (dayPicks.length >= MAX_DAILY_PICKS) return false;
          if (dayPicks.some((a) => a.questSlug === slug)) return false;
          if (!questBySlug.has(slug)) return false;
          const now = new Date().toISOString();
          // A quest already completed today joins the day as completed, so
          // picks and completions can't disagree.
          const doneToday = s.completions.some(
            (c) => c.dateKey === dateKey && c.questSlug === slug
          );
          set({
            assignments: {
              ...s.assignments,
              [dateKey]: [
                ...dayPicks,
                {
                  dateKey,
                  questSlug: slug,
                  status: doneToday ? ("completed" as const) : ("assigned" as const),
                  pickedAt: now,
                  ...(doneToday ? { completedAt: now } : {}),
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
          if (doneToday) {
            touchMyQuest(slug, { status: "completed" });
          } else if (shelfEntry?.status === "completed" || shelfEntry?.status === "archived") {
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

        unpickQuest: (slug) => {
          const s = get();
          const dateKey = toDateKey();
          const dayPicks = s.assignments[dateKey];
          if (!dayPicks) return;
          const target = dayPicks.find((a) => a.questSlug === slug);
          // Completed picks are part of the record — they don't come off.
          if (!target || target.status === "completed") return;
          // Keep the (possibly empty) array so sync knows this device
          // deliberately cleared the day — a missing key would let a stale
          // remote day resurrect on merge.
          set({
            assignments: {
              ...s.assignments,
              [dateKey]: dayPicks.filter((a) => a.questSlug !== slug),
            },
          });
          // Tidy the shelf: an entry born from this very pick (addedAt ===
          // pickedAt) that was never begun leaves with it — the person was
          // browsing, not committing. Removal must tombstone or sync
          // resurrects the row. Older un-begun entries restore their prior
          // standing: a re-picked completed quest returns to the completed
          // record (its walks aren't erased by a change of heart about
          // today), anything else goes back to saved-for-later. A walk
          // that's already begun stays active — unpicking only frees the
          // day, not the journey.
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

        startQuest: (slug) => {
          const s = get();
          const dateKey = toDateKey();
          const dayPicks = s.assignments[dateKey];
          if (!dayPicks?.some((a) => a.questSlug === slug && a.status === "assigned"))
            return;
          set({
            assignments: {
              ...s.assignments,
              [dateKey]: dayPicks.map((a) =>
                a.questSlug === slug && a.status === "assigned"
                  ? { ...a, status: "started" as const, startedAt: new Date().toISOString() }
                  : a
              ),
            },
          });
          touchMyQuest(slug, {
            status: "active",
            pausedAt: undefined,
            ...(get().myQuests[slug]?.startedAt
              ? {}
              : { startedAt: new Date().toISOString() }),
          });
          track("quest_started");
        },

        completeQuestBySlug: (slug, reflection) => {
          const quest = questBySlug.get(slug);
          if (!quest) return { newMilestones: [] };
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

        archiveQuest: (slug) => {
          const s = get();
          const entry = s.myQuests[slug];
          if (!entry || entry.status === "archived") return;
          touchMyQuest(slug, {
            status: "archived",
            archivedAt: new Date().toISOString(),
            pausedAt: undefined,
          });
          // Free today's pick — an archived quest shouldn't keep holding
          // one of the day's three places. Completed picks are history.
          const dateKey = toDateKey();
          const dayPicks = s.assignments[dateKey];
          if (
            dayPicks?.some(
              (a) => a.questSlug === slug && a.status !== "completed"
            )
          ) {
            set({
              assignments: {
                ...get().assignments,
                [dateKey]: dayPicks.filter(
                  (a) => a.questSlug !== slug || a.status === "completed"
                ),
              },
            });
          }
          track("quest_archived");
        },

        removeQuest: (slug) => {
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
          // Also free today's uncompleted pick of the same quest.
          const dateKey = toDateKey();
          const dayPicks = get().assignments[dateKey];
          if (
            dayPicks?.some(
              (a) => a.questSlug === slug && a.status !== "completed"
            )
          ) {
            set({
              assignments: {
                ...get().assignments,
                [dateKey]: dayPicks.filter(
                  (a) => a.questSlug !== slug || a.status === "completed"
                ),
              },
            });
          }
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
          set({
            prayers: get().prayers.map((p) =>
              p.id === prayerId
                ? { ...p, status: "archived" as const, updatedAt: new Date().toISOString() }
                : p
            ),
          });
        },

        unarchivePrayer: (prayerId) => {
          set({
            prayers: get().prayers.map((p) =>
              p.id === prayerId
                ? { ...p, status: "active" as const, updatedAt: new Date().toISOString() }
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
          const existing = s.bookmarks.find(
            (b) =>
              b.bookSlug === bookmark.bookSlug &&
              b.chapter === bookmark.chapter &&
              b.verse === bookmark.verse
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
                  },
                ],
              },
            });
            return false;
          }
          const created: VerseBookmark = {
            ...bookmark,
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

        dismissPendingMilestone: (key) => {
          set({
            pendingMilestones: get().pendingMilestones.filter(
              (k) => k !== key
            ),
          });
        },

        refreshVerse: () => {
          const dateKey = toDateKey();
          const prev = get().verseRefresh;
          set({
            verseRefresh: {
              dateKey,
              // Yesterday's count doesn't carry — a new day starts at its
              // own daily verse and refreshes from there.
              count: prev?.dateKey === dateKey ? prev.count + 1 : 1,
            },
          });
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
                      c.verse === b.verse
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
      version: 6,
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
        return state as unknown as QuestOSState;
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
// or zustand's getSnapshot loops. selectDaysAway is safe because it returns a
// primitive.
// ---------------------------------------------------------------------------

export function selectDaysAway(s: QuestOSState): number | null {
  if (!s.lastVisitDateKey) return null;
  return daysBetween(s.lastVisitDateKey, toDateKey());
}

// Shared empty array so the selector returns a stable reference on days
// with no picks (a fresh [] every call would loop zustand's getSnapshot).
const NO_PICKS: DailyQuestAssignment[] = [];

/** Today's picked quests, in pick order. Stable reference — render-safe. */
export function selectTodayPicks(s: QuestOSState): DailyQuestAssignment[] {
  return s.assignments[toDateKey()] ?? NO_PICKS;
}

/** How many quests the user has picked today (0..MAX_DAILY_PICKS). */
export function selectTodayPickCount(s: QuestOSState): number {
  return s.assignments[toDateKey()]?.length ?? 0;
}

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

export { getDailyVerse };
export { MAX_DAILY_PICKS };
