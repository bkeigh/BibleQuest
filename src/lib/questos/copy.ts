/**
 * Voice library — every reusable line of product copy in one place so the
 * BibleQuest voice stays warm, invitational, and shame-free.
 * See docs/BIBLEQUEST_CODEX.md, Volume III §17 and Volume VIII.
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
  if (daysAway === null) return "Your journey begins with one small step.";
  if (daysAway <= 1) return "Your journey continues.";
  if (daysAway <= 7) return "Welcome back. Begin again with one small step.";
  return "Your journal is still here. Start with today.";
}

export const completionLines = [
  "This became part of your journey.",
  "A small act, faithfully done.",
  "Your tree grew today.",
  "Carry this with you.",
] as const;

export function completionLine(seed: number): string {
  return completionLines[Math.abs(seed) % completionLines.length];
}

export const emptyStates = {
  prayer: "This can be a quiet place to bring what you’re carrying.",
  reflections: "Your reflections will gather here over time.",
  journey: "Your pilgrimage begins with one small step.",
  bookmarks: "Save verses you want to return to.",
  questsFiltered:
    "No quests match that yet. Try a shorter time or a different category.",
} as const;

export const errors = {
  general: "Something didn’t load correctly. Try again in a moment.",
  save: "We couldn’t save this yet. Your draft is still here.",
  offline: "You’re offline. Saved pages and drafts are still here.",
} as const;

export const dayCompleteLines = {
  title: "Today’s journey is complete.",
  body: "Carry this with you. There is nothing left to check off — go and live it.",
} as const;

export const treeStageLabels: Record<string, string> = {
  seed: "Seed",
  sprout: "Sprout",
  young: "Young Tree",
  growing: "Growing Tree",
  "fruit-bearing": "Fruit-Bearing Tree",
  sheltering: "Sheltering Tree",
};

export const treeReturnLine =
  "Your tree has been waiting. Continue with one small step.";
