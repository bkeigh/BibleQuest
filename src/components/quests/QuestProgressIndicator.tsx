"use client";

import type { MyQuest } from "@/lib/questos/types";
import {
  QUEST_STEP_KEYS,
  questStepCount,
  stepsDoneCount,
} from "@/lib/questos/quest-steps";
import { useStrings, fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

/**
 * QuestProgressIndicator — four small pixel squares, one per movement of
 * the walk, with the count in words beside them. The text carries the
 * meaning; the squares are ornament (aria-hidden).
 */
export function QuestProgressIndicator({
  entry,
  className,
}: {
  entry: Pick<MyQuest, "stepsDone" | "status">;
  className?: string;
}) {
  const t = useStrings();
  const done = entry.status === "completed" ? questStepCount() : stepsDoneCount(entry);
  const doneSet = new Set(entry.stepsDone);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {QUEST_STEP_KEYS.map((key) => (
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
        {fmt(t.myQuests.steps, { done, total: questStepCount() })}
      </span>
    </span>
  );
}
