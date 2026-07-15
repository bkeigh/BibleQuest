/**
 * Quest steps — the four gentle movements inside every quest.
 *
 * Steps are DERIVED from the template's own content rather than stored as
 * new content: every quest already carries a scripture, an invitation, a
 * reflection prompt, and a prayer prompt. Naming them as steps lets a
 * person set a quest down mid-walk and pick it back up where they left
 * off — it is a bookmark, never a checklist of obligations. Completing a
 * quest completes every step; skipping steps is always allowed.
 */
import {
  QUEST_STEP_KEYS,
  type MyQuest,
  type QuestStepKey,
} from "./types";

export { QUEST_STEP_KEYS };

/** Total steps in a quest walk. Constant today; a function so richer
 *  multi-part quests can vary it later without touching consumers. */
export function questStepCount(): number {
  return QUEST_STEP_KEYS.length;
}

/** Steps finished on the current walk, capped and de-duplicated. */
export function stepsDoneCount(entry: Pick<MyQuest, "stepsDone">): number {
  return new Set(entry.stepsDone).size;
}

/** The first movement not yet made, in canonical order. Null when done. */
export function nextStep(
  entry: Pick<MyQuest, "stepsDone">
): QuestStepKey | null {
  const done = new Set(entry.stepsDone);
  for (const key of QUEST_STEP_KEYS) {
    if (!done.has(key)) return key;
  }
  return null;
}

/** 0..1 progress for the current walk. Completed entries read as 1. */
export function stepProgress(
  entry: Pick<MyQuest, "stepsDone" | "status">
): number {
  if (entry.status === "completed") return 1;
  return stepsDoneCount(entry) / questStepCount();
}

/** True once the walk has begun in any visible way. */
export function hasBegun(
  entry: Pick<MyQuest, "stepsDone" | "startedAt">
): boolean {
  return Boolean(entry.startedAt) || entry.stepsDone.length > 0;
}
