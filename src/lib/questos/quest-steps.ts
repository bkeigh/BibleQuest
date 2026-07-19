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
  type QuestChecklistItem,
  type QuestTemplate,
} from "./types";

export { QUEST_STEP_KEYS };

/**
 * The explicitly required checklist for this quest. Generic walk steps are
 * intentionally not inferred here: quests without a checklist stay gentle
 * and completable, while checklist quests name their requirements in content.
 */
export function checklistItemsForQuest(
  quest: Pick<QuestTemplate, "checklist">
): readonly QuestChecklistItem[] {
  return quest.checklist ?? [];
}

/** Whether every quest-specific required checkpoint has been marked. */
export function isQuestChecklistComplete(
  quest: Pick<QuestTemplate, "checklist">,
  entry?: Pick<MyQuest, "stepsDone"> | null
): boolean {
  const checklist = checklistItemsForQuest(quest);
  if (checklist.length === 0) return true;
  if (!entry) return false;
  const done = new Set(entry.stepsDone);
  return checklist.every((item) => done.has(item.key));
}

/** True once the walk has begun in any visible way. */
export function hasBegun(
  entry: Pick<MyQuest, "stepsDone" | "startedAt">
): boolean {
  return Boolean(entry.startedAt) || entry.stepsDone.length > 0;
}
