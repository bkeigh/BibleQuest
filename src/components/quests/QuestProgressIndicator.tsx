"use client";

import type { MyQuest, QuestTemplate } from "@/lib/questos/types";
import {
  QUEST_STEP_KEYS,
  checklistItemsForQuest,
} from "@/lib/questos/quest-steps";
import { useStrings, fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

/**
 * QuestProgressIndicator — one small pixel square per required checklist
 * item, or per optional walk movement when the quest has no checklist.
 * The text carries the meaning; the squares are ornament (aria-hidden).
 */
export function QuestProgressIndicator({
  entry,
  quest,
  className,
}: {
  entry: Pick<MyQuest, "stepsDone" | "status">;
  quest: Pick<QuestTemplate, "checklist">;
  className?: string;
}) {
  const t = useStrings();
  const checklistItems = checklistItemsForQuest(quest);
  const stepKeys =
    checklistItems.length > 0
      ? checklistItems.map((item) => item.key)
      : QUEST_STEP_KEYS;
  const doneSet = new Set(entry.stepsDone);
  const total = stepKeys.length;
  const done =
    entry.status === "completed"
      ? total
      : stepKeys.filter((key) => doneSet.has(key)).length;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {stepKeys.map((key) => (
          <span
            key={key}
            className={cn(
              "h-1.5 w-1.5 rounded-[1px]",
              entry.status === "completed" || doneSet.has(key)
                ? "bg-accent"
                : "bg-mist"
            )}
          />
        ))}
      </span>
      <span className="text-caption text-ash">
        {fmt(t.myQuests.steps, { done, total })}
      </span>
    </span>
  );
}
