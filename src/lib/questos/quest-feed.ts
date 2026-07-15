/**
 * Quest feed — ordering and sectioning for the Home quest shelf.
 *
 * Pure functions over the store's myQuests map (plus today's picks) so the
 * feed derivation is testable and never runs inside a zustand selector
 * (selectors must return stable references — see store.ts). Components call
 * these inside useMemo over the raw slices.
 */
import type { DailyQuestAssignment, MyQuest } from "./types";

export interface QuestFeedSections {
  /** Active walks, most recently touched first; today's picks lead. */
  journey: MyQuest[];
  /** Saved-for-later and paused quests, most recently touched first. */
  saved: MyQuest[];
  /** Finished walks, newest completion first. */
  completed: MyQuest[];
  /** Kept for the record, out of the main feed. */
  archived: MyQuest[];
}

function byLastActivityDesc(a: MyQuest, b: MyQuest): number {
  return a.lastActivityAt >= b.lastActivityAt ? -1 : 1;
}

function byCompletedDesc(a: MyQuest, b: MyQuest): number {
  const ax = a.completedAt ?? a.lastActivityAt;
  const bx = b.completedAt ?? b.lastActivityAt;
  return ax >= bx ? -1 : 1;
}

/**
 * Section the shelf. Ordering inside "journey":
 *  1. quests picked for today (in pick order) — the day's intention leads
 *  2. everything else active, by most recent activity
 */
export function buildQuestFeed(
  myQuests: Record<string, MyQuest>,
  todayPicks: DailyQuestAssignment[]
): QuestFeedSections {
  const all = Object.values(myQuests);
  const todayOrder = new Map(todayPicks.map((p, i) => [p.questSlug, i]));

  const journey = all
    .filter((q) => q.status === "active")
    .sort((a, b) => {
      const ta = todayOrder.get(a.questSlug);
      const tb = todayOrder.get(b.questSlug);
      if (ta != null && tb != null) return ta - tb;
      if (ta != null) return -1;
      if (tb != null) return 1;
      return byLastActivityDesc(a, b);
    });

  const saved = all
    .filter((q) => q.status === "saved" || q.status === "paused")
    .sort(byLastActivityDesc);

  const completed = all
    .filter((q) => q.status === "completed")
    .sort(byCompletedDesc);

  const archived = all
    .filter((q) => q.status === "archived")
    .sort(byLastActivityDesc);

  return { journey, saved, completed, archived };
}

/** Anything at all on the shelf? Drives the feed's empty state. */
export function feedIsEmpty(sections: QuestFeedSections): boolean {
  return (
    sections.journey.length === 0 &&
    sections.saved.length === 0 &&
    sections.completed.length === 0 &&
    sections.archived.length === 0
  );
}
