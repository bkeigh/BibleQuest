import { hashString, seededRandom } from "@/lib/utils/dates";
import type {
  ConnectionsProgress,
  ConnectionsPuzzle,
  GameSubmission,
  TimelineProgress,
  TimelinePuzzle,
} from "./types";

export const CONNECTIONS_REVEAL_AFTER = 3;
export const TIMELINE_REVEAL_AFTER = 3;

function shuffled<T>(values: readonly T[], seed: string): T[] {
  const result = [...values];
  const random = seededRandom(hashString(seed));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function nowTimestamp(now?: number): number {
  return Number.isFinite(now) ? Number(now) : Date.now();
}

/** Starts a stable, identity-free Connections session. */
export function createConnectionsProgress(
  puzzle: ConnectionsPuzzle,
  sessionKey: string,
  now?: number,
): ConnectionsProgress {
  return {
    sessionKey,
    puzzleId: puzzle.id,
    contentVersion: puzzle.contentVersion,
    kind: "connections",
    status: "playing",
    misses: 0,
    learningEventRecorded: false,
    updatedAt: nowTimestamp(now),
    termOrder: shuffled(
      puzzle.groups.flatMap((group) => group.terms),
      sessionKey,
    ),
    selectedTerms: [],
    solvedGroupIds: [],
  };
}

/** Selects at most four unsolved terms, with button-friendly toggle semantics. */
export function toggleConnectionTerm(
  progress: ConnectionsProgress,
  term: string,
  availableTerms: ReadonlySet<string>,
  now?: number,
): ConnectionsProgress {
  if (progress.status !== "playing" || !availableTerms.has(term)) return progress;
  const selected = progress.selectedTerms.includes(term);
  if (selected) {
    return {
      ...progress,
      selectedTerms: progress.selectedTerms.filter((value) => value !== term),
      updatedAt: nowTimestamp(now),
    };
  }
  if (progress.selectedTerms.length >= 4) return progress;
  return {
    ...progress,
    selectedTerms: [...progress.selectedTerms, term],
    updatedAt: nowTimestamp(now),
  };
}

/** Checks one four-term group and reveals the study after four gentle misses. */
export function submitConnections(
  puzzle: ConnectionsPuzzle,
  progress: ConnectionsProgress,
  now?: number,
): GameSubmission<ConnectionsProgress> {
  if (progress.status !== "playing" || progress.selectedTerms.length !== 4) {
    return {
      progress,
      announcement: "Choose four terms before checking the group.",
    };
  }
  const selected = new Set(progress.selectedTerms);
  const matched = puzzle.groups.find(
    (group) =>
      !progress.solvedGroupIds.includes(group.id) &&
      group.terms.every((term) => selected.has(term)),
  );
  if (matched) {
    const solvedGroupIds = [...progress.solvedGroupIds, matched.id];
    const completed = solvedGroupIds.length === puzzle.groups.length;
    return {
      progress: {
        ...progress,
        solvedGroupIds,
        selectedTerms: [],
        status: completed ? "completed" : "playing",
        updatedAt: nowTimestamp(now),
      },
      announcement: completed
        ? `${matched.title}. All three connections are gathered.`
        : `${matched.title}. One connection gathered.`,
    };
  }

  const largestOverlap = Math.max(
    ...puzzle.groups
      .filter((group) => !progress.solvedGroupIds.includes(group.id))
      .map((group) => group.terms.filter((term) => selected.has(term)).length),
  );
  const misses = progress.misses + 1;
  const revealed = misses >= CONNECTIONS_REVEAL_AFTER;
  return {
    progress: {
      ...progress,
      misses,
      selectedTerms: [],
      status: revealed ? "revealed" : "playing",
      updatedAt: nowTimestamp(now),
    },
    nearMatch: largestOverlap === 3,
    announcement: revealed
      ? "The connections are shown below so you can explore the passages."
      : largestOverlap === 3
        ? "Very close. One term belongs in another group."
        : "Those four do not form a group yet. Try another arrangement.",
  };
}

/** Lets the learner move to the sourced answer without penalty or payment. */
export function revealConnections(
  progress: ConnectionsProgress,
  now?: number,
): ConnectionsProgress {
  if (progress.status !== "playing") return progress;
  return {
    ...progress,
    status: "revealed",
    selectedTerms: [],
    updatedAt: nowTimestamp(now),
  };
}

/** Starts a stable timeline order and avoids accidentally starting solved. */
export function createTimelineProgress(
  puzzle: TimelinePuzzle,
  sessionKey: string,
  now?: number,
): TimelineProgress {
  const correct = puzzle.items.map((item) => item.id);
  let itemOrder = shuffled(correct, sessionKey);
  if (itemOrder.every((id, index) => id === correct[index])) {
    itemOrder = [...itemOrder.slice(1), itemOrder[0]];
  }
  return {
    sessionKey,
    puzzleId: puzzle.id,
    contentVersion: puzzle.contentVersion,
    kind: "timeline",
    status: "playing",
    misses: 0,
    learningEventRecorded: false,
    updatedAt: nowTimestamp(now),
    itemOrder,
    selectedItemIds: [],
  };
}

/** Advances one simple "what happened next" choice without card movement. */
export function chooseTimelineItem(
  puzzle: TimelinePuzzle,
  progress: TimelineProgress,
  itemId: string,
  now?: number,
): GameSubmission<TimelineProgress> {
  if (
    progress.status !== "playing" ||
    progress.selectedItemIds.includes(itemId)
  ) {
    return { progress, announcement: "" };
  }
  const expected = puzzle.items[progress.selectedItemIds.length];
  if (expected?.id === itemId) {
    const selectedItemIds = [...progress.selectedItemIds, itemId];
    const completed = selectedItemIds.length === puzzle.items.length;
    return {
      progress: {
        ...progress,
        selectedItemIds,
        status: completed ? "completed" : "playing",
        updatedAt: nowTimestamp(now),
      },
      announcement: completed
        ? "You built the whole story in order."
        : "Yes. Now choose what happened next.",
    };
  }
  const misses = progress.misses + 1;
  const revealed = misses >= TIMELINE_REVEAL_AFTER;
  return {
    progress: {
      ...progress,
      misses,
      status: revealed ? "revealed" : "playing",
      itemOrder: revealed
        ? puzzle.items.map((item) => item.id)
        : progress.itemOrder,
      selectedItemIds: revealed
        ? puzzle.items.map((item) => item.id)
        : progress.selectedItemIds,
      updatedAt: nowTimestamp(now),
    },
    announcement: revealed
      ? "Here is the story in order. Open the passages to learn more."
      : misses === TIMELINE_REVEAL_AFTER - 1
        ? `Almost. Hint: look for “${expected?.label ?? "the earliest moment"}.”`
        : "Not that one yet. Try a different moment.",
  };
}

/** Moves one timeline card without requiring drag gestures. */
export function moveTimelineItem(
  progress: TimelineProgress,
  itemId: string,
  direction: "up" | "down",
  now?: number,
): TimelineProgress {
  if (progress.status !== "playing") return progress;
  const index = progress.itemOrder.indexOf(itemId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= progress.itemOrder.length) {
    return progress;
  }
  const itemOrder = [...progress.itemOrder];
  [itemOrder[index], itemOrder[target]] = [itemOrder[target], itemOrder[index]];
  return { ...progress, itemOrder, updatedAt: nowTimestamp(now) };
}

/** Checks narrative order and reveals the study after three incorrect checks. */
export function submitTimeline(
  puzzle: TimelinePuzzle,
  progress: TimelineProgress,
  now?: number,
): GameSubmission<TimelineProgress> {
  if (progress.status !== "playing") return { progress, announcement: "" };
  const correct = puzzle.items.every(
    (item, index) => progress.itemOrder[index] === item.id,
  );
  if (correct) {
    return {
      progress: {
        ...progress,
        status: "completed",
        selectedItemIds: puzzle.items.map((item) => item.id),
        updatedAt: nowTimestamp(now),
      },
      announcement: "The story is in order. Explore how each moment connects.",
    };
  }
  const misses = progress.misses + 1;
  const revealed = misses >= TIMELINE_REVEAL_AFTER;
  return {
    progress: {
      ...progress,
      misses,
      status: revealed ? "revealed" : "playing",
      itemOrder: revealed ? puzzle.items.map((item) => item.id) : progress.itemOrder,
      selectedItemIds: revealed
        ? puzzle.items.map((item) => item.id)
        : progress.selectedItemIds,
      updatedAt: nowTimestamp(now),
    },
    announcement: revealed
      ? "The narrative order is shown below so you can explore each passage."
      : "That is not the narrative order yet. Move a moment and try again.",
  };
}

/** Reveals correct order freely; hints and answer explanations are never sold. */
export function revealTimeline(
  puzzle: TimelinePuzzle,
  progress: TimelineProgress,
  now?: number,
): TimelineProgress {
  if (progress.status !== "playing") return progress;
  return {
    ...progress,
    status: "revealed",
    itemOrder: puzzle.items.map((item) => item.id),
    selectedItemIds: puzzle.items.map((item) => item.id),
    updatedAt: nowTimestamp(now),
  };
}
