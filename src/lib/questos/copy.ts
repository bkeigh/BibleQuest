/**
 * Voice library — every reusable line of product copy in one place so the
 * BibleQuest voice stays warm, direct, and shame-free.
 *
 * Register: plain and confident, never hushed-precious. Say the thing.
 * Target lines: "Not a streak. A pilgrimage." / "go live it" /
 * "How are you, honestly?" No "gently", no "carried", no guilt.
 * See docs/BIBLEQUEST_CODEX.md Vol III §17, Vol VIII, docs/CONTENT_GUIDE.md.
 */
import type { TimeOfDay } from "@/lib/utils/dates";

export function greeting(time: TimeOfDay, name?: string): string {
  const who = name ? `, ${name}` : "";
  switch (time) {
    case "morning":
      return `Good morning${who}.`;
    case "afternoon":
      return `Good afternoon${who}.`;
    case "evening":
      return `Good evening${who}.`;
    case "night":
      return `A quiet hour${who}.`;
  }
}

/** Sub-greeting adapts to how long the user has been away. Never shame. */
export function returnLine(daysAway: number | null): string {
  if (daysAway === null) return "Today's a good day to start.";
  if (daysAway <= 1) return "Right where you left off.";
  if (daysAway <= 7) return "Welcome back. Pick one small thing.";
  return "It's all still here. Start with today.";
}

export const completionLines = [
  "Done. That counts.",
  "A small thing, done well.",
  "Your tree grew today.",
  "That one's yours now.",
] as const;

export function completionLine(seed: number): string {
  return completionLines[Math.abs(seed) % completionLines.length];
}

export const emptyStates = {
  prayer: "Write what's actually on your mind. It stays private.",
  reflections: "Your reflections will collect here.",
  journey: "Nothing here yet. Your first quest will show up here.",
  bookmarks: "Save verses you want to come back to.",
  questsFiltered: "Nothing matches those filters. Try widening them.",
  questsUnpicked: "No quests picked yet. Choose up to three for today.",
} as const;

export const errors = {
  general: "Something didn’t load correctly. Try again in a moment.",
  save: "We couldn’t save this yet. Your draft is still here.",
  offline: "You’re offline. Saved pages and drafts are still here.",
} as const;

export const dayCompleteLines = {
  title: "That’s everything for today.",
  body: "Nothing left to check off. Go live it.",
} as const;

/** The pick-up-to-3 quest model (Home + Quests page share these). */
export const questPicks = {
  /** Home, no picks yet */
  emptyTitle: "Today’s open.",
  emptyBody: "Pick up to three quests. One is plenty.",
  cta: "Pick today’s quests",
  browseMore: "Add another quest",
  counter: (n: number) => `${n} of 3 picked`,
  capReached: "That’s your three for today. Tomorrow brings a fresh start.",
  added: "Added to today.",
  removed: "Removed from today.",
  pinnedTitle: "Today",
  suggestedTitle: "Suggested for today",
} as const;

export const treeStageLabels: Record<string, string> = {
  seed: "Seed",
  sprout: "Sprout",
  young: "Young Tree",
  growing: "Growing Tree",
  "fruit-bearing": "Fruit-Bearing Tree",
  sheltering: "Sheltering Tree",
};

export const treeReturnLine = "One quest is enough to keep growing.";
