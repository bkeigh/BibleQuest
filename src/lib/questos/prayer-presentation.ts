import type { PrayerCategory } from "./types";

/** Keeps prayer category display names shared by composer and journal views. */
export const PRAYER_CATEGORY_LABEL: Record<PrayerCategory, string> = {
  morning: "Morning",
  evening: "Evening",
  gratitude: "Gratitude",
  difficulty: "In difficulty",
  intercession: "For others",
  stillness: "Stillness",
  forgiveness: "Forgiveness",
  courage: "Courage",
  family: "Family",
  work: "Work",
  general: "General",
};
