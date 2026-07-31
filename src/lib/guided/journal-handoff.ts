import {
  dailyGuidedScripture,
  guidedPracticeById,
  pilgrimages,
} from "@/data/guided/content";
import { prayerPrompts } from "@/data/seed/prayer-prompts";
import type { PrayerCategory } from "@/lib/questos/types";

export interface GuidedJournalHandoff {
  practiceId: string;
  draftScopeId: string;
  returnPath: string;
  title: string;
  verseReference: string;
  reflectionPrompt: string;
  prayerBody: string;
  prayerCategory: PrayerCategory;
}

/** Keeps journal completion inside the exact reviewed guide that opened it. */
const GUIDED_JOURNAL_RETURN_PATHS = new Map<string, string>([
  ...dailyGuidedScripture.map(
    (practice) => [practice.id, "/app/guided/daily"] as const,
  ),
  ...pilgrimages.flatMap((pilgrimage) =>
    pilgrimage.days.map(
      (practice, index) =>
        [
          practice.id,
          `/app/pilgrimages/${pilgrimage.slug}/${index + 1}`,
        ] as const,
    ),
  ),
]);

/** Resolves only checked-in guide ids into exact reviewed journal copy. */
export function guidedJournalHandoff(
  practiceId: string | null,
): GuidedJournalHandoff | null {
  if (!practiceId) return null;
  const practice = guidedPracticeById.get(practiceId);
  const returnPath = GUIDED_JOURNAL_RETURN_PATHS.get(practiceId);
  if (!practice || !returnPath) return null;
  const prayerCategory =
    prayerPrompts.find((prompt) => prompt.id === practice.prayerPromptId)
      ?.category ?? "general";
  return {
    practiceId: practice.id,
    draftScopeId: `guided:${practice.id}`,
    returnPath,
    title: practice.title,
    verseReference: practice.scripture.reference,
    reflectionPrompt: practice.reflect,
    prayerBody: practice.prayer,
    prayerCategory,
  };
}
