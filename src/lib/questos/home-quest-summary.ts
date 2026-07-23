interface HomeQuestSummaryInput {
  activeCount: number;
  readyCount: number;
  completedCount: number;
  visibleCount: number;
  occupiedCount: number;
  hiddenReservationCount: number;
}

/** Builds the compact status line that remains visible while quests are closed. */
export function homeQuestSummary({
  activeCount,
  readyCount,
  completedCount,
  visibleCount,
  occupiedCount,
  hiddenReservationCount,
}: HomeQuestSummaryInput): string {
  if (visibleCount === 0) {
    return hiddenReservationCount > 0
      ? `${occupiedCount} ${occupiedCount === 1 ? "slot" : "slots"} reserved`
      : "Choose a quest";
  }

  if (completedCount === visibleCount) {
    return `${completedCount} of ${visibleCount} complete`;
  }

  const parts = [
    activeCount > 0
      ? `${activeCount} active`
      : null,
    readyCount > 0
      ? `${readyCount} ready`
      : null,
    completedCount > 0
      ? `${completedCount} complete`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}
