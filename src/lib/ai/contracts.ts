import {
  QUEST_GENERATION_FOCUSES,
  type QuestGenerationFocus,
  type QuestGenerationRequest,
} from "@/lib/quest-generation/provider";
import {
  QUEST_CATEGORIES,
  QUEST_DURATIONS,
  type QuestCategory,
  type QuestDuration,
} from "@/lib/questos/types";

export const MY_SHEPHERD_MAX_QUESTION_LENGTH = 400;

export interface MyShepherdAnswer {
  answer: string;
  scriptureReferences: string[];
  nextStep: string;
  safetyNote: string | null;
}

/** Accepts only the small, non-sensitive preference shape used by quest matching. */
export function parseQuestGenerationInput(
  value: unknown,
): QuestGenerationRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const category =
    typeof input.category === "string" &&
    QUEST_CATEGORIES.includes(input.category as QuestCategory)
      ? (input.category as QuestCategory)
      : undefined;
  const duration =
    typeof input.duration === "number" &&
    QUEST_DURATIONS.includes(input.duration as QuestDuration)
      ? (input.duration as QuestDuration)
      : undefined;
  const focus =
    typeof input.focus === "string" &&
    QUEST_GENERATION_FOCUSES.includes(
      input.focus as QuestGenerationFocus,
    )
      ? (input.focus as QuestGenerationFocus)
      : undefined;
  const variation =
    typeof input.variation === "number" &&
    Number.isInteger(input.variation) &&
    input.variation >= 0 &&
    input.variation <= 100
      ? input.variation
      : null;

  if (
    variation === null ||
    ("category" in input && input.category !== undefined && !category) ||
    ("duration" in input && input.duration !== undefined && !duration) ||
    ("focus" in input && input.focus !== undefined && !focus)
  ) {
    return null;
  }
  return { category, duration, focus, variation };
}

/** Trims one bounded question and rejects object-shaped or oversized input. */
export function parseMyShepherdQuestion(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const question = (value as Record<string, unknown>).question;
  if (typeof question !== "string") return null;
  const trimmed = question.trim();
  if (
    trimmed.length < 3 ||
    trimmed.length > MY_SHEPHERD_MAX_QUESTION_LENGTH
  ) {
    return null;
  }
  return trimmed;
}

/** Stops immediate danger and self-harm requests before any model is called. */
export function isImmediateSafetyQuestion(question: string): boolean {
  const normalized = question.toLocaleLowerCase();
  return [
    /\bkill myself\b/,
    /\bend my life\b/,
    /\bsuicid(?:e|al)\b/,
    /\bhurt myself\b/,
    /\bharm myself\b/,
    /\bhurt (?:him|her|them|someone)\b/,
    /\bkill (?:him|her|them|someone)\b/,
    /\bin immediate danger\b/,
    /\bbeing abused right now\b/,
  ].some((pattern) => pattern.test(normalized));
}

/** Provides a deterministic, non-model response for immediate safety concerns. */
export function immediateSafetyAnswer(): MyShepherdAnswer {
  return {
    answer:
      "Your safety matters more than continuing this study. Move toward a safe person or place now, and contact local emergency services if there is immediate danger.",
    scriptureReferences: [],
    nextStep:
      "Tell a trusted person nearby what is happening and ask them to stay with you.",
    safetyNote:
      "MyShepherd is not emergency, crisis, medical, or mental-health care.",
  };
}
