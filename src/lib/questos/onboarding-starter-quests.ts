import type { QuestTemplate } from "./types";

/** Maximum effort promised by the first-run "gentle quest" language. */
export const ONBOARDING_STARTER_MAX_MINUTES = 10;

/**
 * Existing reviewed quests suitable for a first encounter with BibleQuest.
 * They are solo, gentle, free, time-bounded, and carry no sensitive-category
 * tag; the content owner still approves their new onboarding placement.
 */
export const ONBOARDING_STARTER_QUEST_SLUGS = [
  "five-minutes-of-silence",
  "read-one-psalm-slowly",
  "notice-where-kindness-found-you",
  "three-small-thanks",
] as const;

/** Builds the ordered starter pool and fails closed if seed metadata drifts. */
export function onboardingStarterQuests(
  quests: readonly QuestTemplate[],
): QuestTemplate[] {
  const bySlug = new Map(quests.map((quest) => [quest.slug, quest]));
  return ONBOARDING_STARTER_QUEST_SLUGS.flatMap((slug) => {
    const quest = bySlug.get(slug);
    if (
      !quest ||
      quest.isPremium ||
      quest.durationMinutes > ONBOARDING_STARTER_MAX_MINUTES ||
      quest.difficulty !== "gentle" ||
      quest.soloOrSocial !== "solo" ||
      quest.sensitivityTags.length > 0
    ) {
      return [];
    }
    return [quest];
  });
}
