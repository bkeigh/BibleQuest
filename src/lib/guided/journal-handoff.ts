import { guidedPracticeById } from "@/data/guided/content";
import { prayerPrompts } from "@/data/seed/prayer-prompts";
import type { PrayerCategory } from "@/lib/questos/types";

export interface GuidedJournalHandoff {
  practiceId: string;
  title: string;
  verseReference: string;
  reflectionPrompt: string;
  prayerBody: string;
  prayerCategory: PrayerCategory;
}

/** Resolves only checked-in guide ids into exact reviewed journal copy. */
export function guidedJournalHandoff(
  practiceId: string | null,
): GuidedJournalHandoff | null {
  if (!practiceId) return null;
  const practice = guidedPracticeById.get(practiceId);
  if (!practice) return null;
  const prayerCategory =
    prayerPrompts.find((prompt) => prompt.id === practice.prayerPromptId)
      ?.category ?? "general";
  return {
    practiceId: practice.id,
    title: practice.title,
    verseReference: practice.scripture.reference,
    reflectionPrompt: practice.reflect,
    prayerBody: practice.prayer,
    prayerCategory,
  };
}
