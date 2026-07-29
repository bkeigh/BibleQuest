/**
 * Builds the single Home quest collection from rolling assignments and the
 * persistent shelf. A current assignment wins by slug so countdowns and
 * window status stay visible without showing the same quest twice.
 */
import type {
  DailyQuestAssignment,
  MyQuest,
  QuestTemplate,
} from "./types";
import { hasBegun } from "./quest-steps";
import { toDateKey } from "@/lib/utils/dates";

export type HomeQuestGroupKey = "active" | "ready" | "completed";

export type HomeQuestItem =
  | {
      kind: "assignment";
      quest: QuestTemplate;
      assignment: DailyQuestAssignment;
    }
  | {
      kind: "shelf";
      quest: QuestTemplate;
      entry: MyQuest;
    };

export type HomeQuestGroups = Record<HomeQuestGroupKey, HomeQuestItem[]>;

function shelfGroup(
  entry: MyQuest,
  todayKey: string,
): HomeQuestGroupKey | null {
  if (
    entry.status === "completed" &&
    entry.completedAt &&
    toDateKey(new Date(entry.completedAt)) === todayKey
  ) {
    return "completed";
  }
  if (entry.status === "active") {
    return hasBegun(entry) ? "active" : "ready";
  }
  return null;
}

function assignmentGroup(
  assignment: DailyQuestAssignment,
  todayKey: string,
): HomeQuestGroupKey | null {
  if (assignment.status === "started") return "active";
  if (assignment.status === "assigned") return "ready";
  if (
    assignment.status === "completed" &&
    assignment.completedAt &&
    toDateKey(new Date(assignment.completedAt)) === todayKey
  ) {
    return "completed";
  }
  return null;
}

function byShelfActivity(a: MyQuest, b: MyQuest): number {
  const aTime =
    a.status === "completed" ? (a.completedAt ?? a.lastActivityAt) : a.lastActivityAt;
  const bTime =
    b.status === "completed" ? (b.completedAt ?? b.lastActivityAt) : b.lastActivityAt;
  return bTime.localeCompare(aTime);
}

/**
 * Groups current assignments first, then shelf-only quests by recent activity.
 * Expired Active windows remain resumable; unknown templates, released legacy
 * windows, and duplicate slugs are ignored safely.
 */
export function buildHomeQuestGroups({
  assignments,
  myQuests,
  questsBySlug,
  now = Date.now(),
}: {
  assignments: DailyQuestAssignment[];
  myQuests: Record<string, MyQuest>;
  questsBySlug: ReadonlyMap<string, QuestTemplate>;
  now?: number;
}): HomeQuestGroups {
  const groups: HomeQuestGroups = {
    active: [],
    ready: [],
    completed: [],
  };
  const seen = new Set<string>();
  const todayKey = toDateKey(new Date(now));

  for (const assignment of assignments) {
    if (seen.has(assignment.questSlug)) continue;
    const group = assignmentGroup(assignment, todayKey);
    const quest = questsBySlug.get(assignment.questSlug);
    if (!group || !quest) continue;
    groups[group].push({ kind: "assignment", quest, assignment });
    seen.add(assignment.questSlug);
  }

  const shelfEntries = Object.values(myQuests).sort(byShelfActivity);
  for (const entry of shelfEntries) {
    if (seen.has(entry.questSlug)) continue;
    const quest = questsBySlug.get(entry.questSlug);
    if (!quest) continue;
    const group = shelfGroup(entry, todayKey);
    if (!group) continue;
    groups[group].push({ kind: "shelf", quest, entry });
    seen.add(entry.questSlug);
  }

  return groups;
}
