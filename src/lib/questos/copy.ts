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

export const emptyStates = {
  prayer: "Write what’s actually on your mind. Save it in your private-by-default journal.",
  reflections: "Your reflections will collect here.",
  journey: "Nothing here yet. Your first meaningful step will show up here.",
  bookmarks: "Save verses you want to come back to.",
  questsFiltered: "Nothing matches those filters. Try widening them.",
  questsUnpicked: "No active quests yet. Choose up to three 24-hour windows.",
} as const;

export const errors = {
  general: "Something didn’t load correctly. Try again in a moment.",
  save: "We couldn’t save this yet. Your draft is still here.",
  offline: "You’re offline. Saved pages and drafts are still here.",
} as const;

export const treeStageLabels: Record<string, string> = {
  seed: "Seed",
  "stirring-seed": "Stirring Seed",
  "first-root": "First Root",
  "first-shoot": "First Shoot",
  sprout: "New Sprout",
  "rooted-sprout": "Rooted Sprout",
  "young-sapling": "Young Sapling",
  "branching-sapling": "Branching Sapling",
  "leafing-sapling": "Leafing Sapling",
  young: "Young Tree",
  growing: "Growing Tree",
  spreading: "Spreading Tree",
  budding: "Budding Tree",
  flowering: "Flowering Tree",
  "first-fruit": "First Fruit",
  "fruit-bearing": "Fruit-Bearing Tree",
  flourishing: "Flourishing Tree",
  sturdy: "Sturdy Tree",
  shade: "Shade Tree",
  sheltering: "Sheltering Tree",
};
