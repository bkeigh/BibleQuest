import type { QuestCategory } from "./types";

/** Formats reviewed quest durations for every catalogue and detail surface. */
export function formatQuestDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes === 240) return "Half day";
  if (minutes === 480) return "Full day";
  return `${Math.round(minutes / 60)} hours`;
}

/** Keeps category display names consistent across every quest surface. */
export const QUEST_CATEGORY_LABEL: Record<QuestCategory, string> = {
  prayer: "Prayer",
  scripture: "Scripture",
  service: "Service",
  kindness: "Kindness",
  forgiveness: "Forgiveness",
  generosity: "Generosity",
  discipline: "Discipline",
  gratitude: "Gratitude",
  silence: "Silence",
  worship: "Worship",
  family: "Family",
  community: "Community",
  reflection: "Reflection",
  patience: "Patience",
};
