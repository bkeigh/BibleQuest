/**
 * Voice library — reusable lines of product copy so the BibleQuest voice
 * stays warm, direct, and shame-free.
 *
 * Register: plain and confident, never hushed-precious. Say the thing.
 * Target lines: "Your candle is waiting." / "go live it" /
 * "How are you, honestly?" No "gently", no "carried", no guilt.
 * See docs/BIBLEQUEST_CODEX.md Vol III §17, Vol VIII, docs/CONTENT_GUIDE.md.
 *
 * NOTE: user-facing chrome should prefer the i18n layer (useStrings) — these
 * remain only where screens still read them directly.
 */

const completionLines = [
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

export const treeStageLabels: Record<string, string> = {
  seed: "Seed",
  sprout: "Sprout",
  young: "Young Tree",
  growing: "Growing Tree",
  "fruit-bearing": "Fruit-Bearing Tree",
  sheltering: "Sheltering Tree",
};

export const treeReturnLine = "One quest is enough to keep growing.";
