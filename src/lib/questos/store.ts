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
import { seedQuests, questBySlug } from "@/data/seed/quests";
import { seedMilestones } from "@/data/seed/milestones";
import { getDailyVerse } from "./verse-engine";
import { selectDailyQuest } from "./quest-engine";
import { computeMetrics, checkMilestones } from "./milestone-engine";
import { getCurrentSeason } from "./seasonal-engine";
import { toDateKey, daysBetween } from "@/lib/utils/dates";
import { track } from "@/lib/analytics/events";
import {
  DEFAULT_SETTINGS,
  type DailyQuestAssignment,
  type EarnedMilestone,
  type GrowthEvent,
  type JourneyEvent,
  type JourneyEventType,
  type MilestoneSeed,
  type Prayer,
  type PrayerCategory,
  type Profile,
  type QuestCompletion,
  type QuestTemplate,
  type ReadingPosition,
  type Reflection,
  type ReflectionMood,
  type Settings,
  type ChapterRead,
  type VerseBookmark,
  type GrowthType,
} from "./types";

function id(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}${Date.now()}`;
}

interface QuestOSState {
  profile: Profile | null;
  settings: Settings;
  assignments: Record<string, DailyQuestAssignment>;
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

  // -- lifecycle
  completeOnboarding: (profile: Omit<Profile, "onboardingCompleted" | "createdAt">, settings?: Partial<Settings>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  recordVisit: () => void;
  clearAllData: () => void;

  // -- daily loop
  /** Pure read — safe during render. Does NOT persist. */
  getTodayAssignment: () => { assignment: DailyQuestAssignment; quest: QuestTemplate } | null;
  /** Persists today's assignment if missing. Call from an effect, never render. */
  ensureDailyQuest: () => void;
  rerollTodayQuest: () => void;
  startTodayQuest: () => void;
  completeTodayQuest: (reflection?: { body: string; mood?: ReflectionMood }) => { newMilestones: MilestoneSeed[] };
  completeQuestBySlug: (slug: string, reflection?: { body: string; mood?: ReflectionMood }) => { newMilestones: MilestoneSeed[] };

  // -- prayer
  addPrayer: (data: { title?: string; body: string; category: PrayerCategory }) => Prayer;
  updatePrayer: (prayerId: string, patch: Partial<Pick<Prayer, "title" | "body" | "category">>) => void;
  archivePrayer: (prayerId: string) => void;
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

  // -- milestones
  dismissPendingMilestone: (key: string) => void;
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
        set({
          journeyEvents: [...state.journeyEvents, journey],
          growthEvents: growth
            ? [...state.growthEvents, growth]
            : state.growthEvents,
        });
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

      function completeQuest(
        quest: QuestTemplate,
        reflection?: { body: string; mood?: ReflectionMood }
      ): { newMilestones: MilestoneSeed[] } {
        const s = get();
        const now = new Date();
        const dateKey = toDateKey(now);

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

        const assignment = s.assignments[dateKey];
        if (assignment && assignment.questSlug === quest.slug) {
          set({
            assignments: {
              ...get().assignments,
              [dateKey]: {
                ...assignment,
                status: "completed",
                completedAt: now.toISOString(),
              },
            },
          });
        }

        recordAction("quest_completed", quest.title, quest.growthType);
        track("quest_completed", { category: quest.category });
        return { newMilestones: runMilestoneCheck() };
      }

      return {
        profile: null,
        settings: DEFAULT_SETTINGS,
        assignments: {},
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
        },

        recordVisit: () => {
          set({ lastVisitDateKey: toDateKey() });
        },

        clearAllData: () => {
          set({
            profile: null,
            settings: DEFAULT_SETTINGS,
            assignments: {},
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
          });
        },

        getTodayAssignment: () => {
          const s = get();
          const dateKey = toDateKey();
          const existing = s.assignments[dateKey];
          if (existing) {
            const quest = questBySlug.get(existing.questSlug);
            if (quest) return { assignment: existing, quest };
          }
          // Compute today's quest deterministically WITHOUT persisting, so this
          // is safe to call during render. ensureDailyQuest() persists it.
          const quest = selectDailyQuest({
            quests: seedQuests,
            dateKey,
            profile: s.profile,
            settings: s.settings,
            season: getCurrentSeason().key,
            recentSlugs: s.completions.map((c) => c.questSlug),
          });
          if (!quest) return null;
          return {
            assignment: {
              dateKey,
              questSlug: quest.slug,
              status: "assigned",
              rerolls: 0,
            },
            quest,
          };
        },

        ensureDailyQuest: () => {
          const s = get();
          const dateKey = toDateKey();
          if (s.assignments[dateKey]) return;
          const quest = selectDailyQuest({
            quests: seedQuests,
            dateKey,
            profile: s.profile,
            settings: s.settings,
            season: getCurrentSeason().key,
            recentSlugs: s.completions.map((c) => c.questSlug),
          });
          if (!quest) return;
          set({
            assignments: {
              ...s.assignments,
              [dateKey]: {
                dateKey,
                questSlug: quest.slug,
                status: "assigned",
                rerolls: 0,
              },
            },
          });
        },

        rerollTodayQuest: () => {
          const s = get();
          const dateKey = toDateKey();
          const current = s.assignments[dateKey];
          if (!current || current.status === "completed") return;
          const quest = selectDailyQuest({
            quests: seedQuests,
            dateKey,
            profile: s.profile,
            settings: s.settings,
            season: getCurrentSeason().key,
            recentSlugs: s.completions.map((c) => c.questSlug),
            reroll: current.rerolls + 1,
            excludeSlugs: [current.questSlug],
          });
          if (!quest) return;
          set({
            assignments: {
              ...s.assignments,
              [dateKey]: {
                dateKey,
                questSlug: quest.slug,
                status: "assigned",
                rerolls: current.rerolls + 1,
              },
            },
          });
        },

        startTodayQuest: () => {
          const s = get();
          const dateKey = toDateKey();
          const current = s.assignments[dateKey];
          if (!current || current.status !== "assigned") return;
          set({
            assignments: {
              ...s.assignments,
              [dateKey]: {
                ...current,
                status: "started",
                startedAt: new Date().toISOString(),
              },
            },
          });
          track("quest_started");
        },

        completeTodayQuest: (reflection) => {
          const s = get();
          const dateKey = toDateKey();
          const current = s.assignments[dateKey];
          const quest = current ? questBySlug.get(current.questSlug) : null;
          if (!quest) return { newMilestones: [] };
          return completeQuest(quest, reflection);
        },

        completeQuestBySlug: (slug, reflection) => {
          const quest = questBySlug.get(slug);
          if (!quest) return { newMilestones: [] };
          return completeQuest(quest, reflection);
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

        deletePrayer: (prayerId) => {
          set({ prayers: get().prayers.filter((p) => p.id !== prayerId) });
        },

        markPrayerAnswered: (prayerId, answerReflection) => {
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
          set({
            reflections: get().reflections.filter((r) => r.id !== reflectionId),
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
      };
    },
    {
      name: "biblequest:v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
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

export { getDailyVerse };
