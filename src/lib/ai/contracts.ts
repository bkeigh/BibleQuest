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

// Bounds transport memory independently from the smaller validated fields.
export const AI_REQUEST_MAX_BYTES = 4_096;

export const MY_SHEPHERD_DESTINATIONS = [
  "home",
  "quests",
  "bible",
  "prayer",
  "reflections",
  "journey",
  "games",
  "guided",
  "pilgrimages",
  "rhythm",
  "settings",
] as const;

export type MyShepherdDestination =
  (typeof MY_SHEPHERD_DESTINATIONS)[number];

export interface MyShepherdAppAction {
  destination: MyShepherdDestination;
  label: string;
}

export interface MyShepherdAnswer {
  answer: string;
  scriptureReferences: string[];
  nextStep: string;
  safetyNote: string | null;
  /** Optional navigation is limited to a closed list of safe app destinations. */
  appAction: MyShepherdAppAction | null;
}

export interface MyShepherdRequest {
  question: string;
  currentPath: string | null;
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

/** Accepts one bounded question and an optional non-sensitive app route. */
export function parseMyShepherdRequest(
  value: unknown,
): MyShepherdRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const question = input.question;
  if (typeof question !== "string") return null;
  const trimmed = question.trim();
  if (
    trimmed.length < 3 ||
    trimmed.length > MY_SHEPHERD_MAX_QUESTION_LENGTH
  ) {
    return null;
  }
  const currentPath =
    typeof input.currentPath === "string" &&
    input.currentPath.length <= 120 &&
    /^\/app(?:\/[a-z0-9-]+){0,4}$/.test(input.currentPath)
      ? input.currentPath
      : null;
  return { question: trimmed, currentPath };
}

/** Stops immediate danger and self-harm requests before any model is called. */
export function isImmediateSafetyQuestion(question: string): boolean {
  const normalized = question.toLocaleLowerCase();
  return [
    /\bkill myself\b/,
    /\bend my life\b/,
    /\bsuicid(?:e|al)\b/,
    /\b(?:want|wish|hope|plan|planning|going) to die\b/,
    /\bwish i (?:was|were) dead\b/,
    /\bbetter off dead\b/,
    /\bno (?:reason|point) (?:for me )?to (?:live|go on)\b/,
    /\b(?:do not|don't|cannot|can't) want to (?:be alive|live)\b/,
    /\bhurt myself\b/,
    /\bharm myself\b/,
    /\b(?:about|going|planning) to (?:overdose|(?:hurt|harm) myself)\b/,
    /\b(?:just took|have taken|took) (?:an? )?overdose\b/,
    /\bhurt (?:him|her|them|someone)\b/,
    /\bkill (?:him|her|them|someone)\b/,
    /\b(?:about|going|planning) to (?:hurt|harm|kill) (?:him|her|them|someone)\b/,
    /\bin immediate danger\b/,
    /\b(?:being|am being) (?:abused|attacked|hurt) (?:now|right now)\b/,
    /\bsomeone is (?:attacking|hurting|abusing) me (?:now|right now)\b/,
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
    appAction: null,
  };
}
