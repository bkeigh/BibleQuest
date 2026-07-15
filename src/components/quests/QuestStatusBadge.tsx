"use client";

import type { MyQuest } from "@/lib/questos/types";
import { hasBegun } from "@/lib/questos/quest-steps";
import { IconCheck } from "@/components/design-system/icons";
import { useStrings } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

/** Display status — the words carry the meaning, never color alone. */
export type QuestDisplayStatus =
  | "new"
  | "inProgress"
  | "saved"
  | "paused"
  | "completed"
  | "archived";

export function displayStatus(entry: MyQuest): QuestDisplayStatus {
  switch (entry.status) {
    case "completed":
      return "completed";
    case "paused":
      return "paused";
    case "saved":
      return "saved";
    case "archived":
      return "archived";
    case "active":
      return hasBegun(entry) ? "inProgress" : "new";
  }
}

const STYLES: Record<QuestDisplayStatus, string> = {
  new: "bg-linen text-charcoal ring-1 ring-mist",
  inProgress: "bg-accent-surface text-accent",
  saved: "bg-linen text-charcoal ring-1 ring-mist",
  paused: "bg-linen text-ash ring-1 ring-mist",
  completed: "bg-accent-surface text-accent-ink",
  archived: "bg-linen text-ash ring-1 ring-mist",
};

/**
 * QuestStatusBadge — quiet pixel-voice chip naming where a quest stands.
 * Follows the existing "Done"/"Picked" chip pattern from QuestSlip.
 */
export function QuestStatusBadge({
  entry,
  className,
}: {
  entry: MyQuest;
  className?: string;
}) {
  const t = useStrings();
  const status = displayStatus(entry);
  const label: Record<QuestDisplayStatus, string> = {
    new: t.myQuests.statusNew,
    inProgress: t.myQuests.statusInProgress,
    saved: t.myQuests.statusSaved,
    paused: t.myQuests.statusPaused,
    completed: t.myQuests.statusCompleted,
    archived: t.myQuests.statusArchived,
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-pixel text-[0.875rem]",
        STYLES[status],
        className
      )}
    >
      {status === "completed" && <IconCheck size={12} />}
      {label[status]}
    </span>
  );
}

/** The "Today" chip — this quest is one of the day's picks. */
export function TodayBadge({ className }: { className?: string }) {
  const t = useStrings();
  return (
    <span
      className={cn(
        "pixel-frame inline-flex shrink-0 items-center bg-gold-500/15 px-2 py-0.5 font-pixel text-[0.875rem] text-gilt",
        className
      )}
    >
      {t.myQuests.statusToday}
    </span>
  );
}
