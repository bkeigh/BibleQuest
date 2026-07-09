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
  type QuestOSSnapshot,
  type SyncTombstones,
  emptyTombstones,
} from "./types";

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
  /** Local deletions the sync engine still needs to propagate remotely. */
  tombstones: SyncTombstones;

  // -- lifecycle
  completeOnboarding: (profile: Omit<Profile, "onboardingCompleted" | "createdAt">, settings?: Partial<Settings>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  recordVisit: () => void;
  clearAllData: () => void;
  /** Replace all local data with a validated, previously-exported snapshot. */
  importData: (snapshot: Partial<QuestOSSnapshot>) => void;

  // -- daily loop (pick model: the user chooses up to MAX_DAILY_PICKS a day)
  /** Add a quest to today. Returns false when the day is full or already picked. */
  pickQuest: (slug: string) => boolean;
  /** Remove an uncompleted quest from today. Completed picks stay. */
  unpickQuest: (slug: string) => void;
  /** Mark a picked quest as underway. */
  startQuest: (slug: string) => void;
  completeQuestBySlug: (slug: string, reflection?: { body: string; mood?: ReflectionMood }) => { newMilestones: MilestoneSeed[] };

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

  // -- milestones
  dismissPendingMilestone: (key: string) => void;

  // -- sync bookkeeping
  /** Remove tombstone entries the sync engine has propagated remotely. */
  clearSyncTombstones: (cleared: SyncTombstones) => void;
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

        const dayPicks = s.assignments[dateKey] ?? [];
        if (dayPicks.some((a) => a.questSlug === quest.slug)) {
          set({
            assignments: {
              ...get().assignments,
              [dateKey]: dayPicks.map((a) =>
                a.questSlug === quest.slug
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
            tombstones: emptyTombstones(),
          });
        },

        importData: (snapshot) => {
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
          });
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
          track("quest_started");
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

        clearSyncTombstones: (cleared) => {
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
            },
          });
        },
      };
    },
    {
      name: "biblequest:v1",
      storage: createJSONStorage(() => localStorage),
      version: 3,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // v2 adds sync tombstones.
          state.tombstones = emptyTombstones();
        }
        if (version < 3) {
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

export { getDailyVerse };
export { MAX_DAILY_PICKS };
