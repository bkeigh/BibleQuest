interface HomeQuestSummaryInput {
  activeCount: number;
  readyCount: number;
  completedCount: number;
  visibleCount: number;
  occupiedCount: number;
  hiddenReservationCount: number;
}

/** Builds the compact status line that remains visible above quest drawers. */
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
    const complete = `${completedCount} of ${visibleCount} complete`;
    return hiddenReservationCount > 0
      ? `${complete} · ${hiddenReservationCount} ${hiddenReservationCount === 1 ? "slot" : "slots"} reserved`
      : complete;
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
    hiddenReservationCount > 0
      ? `${hiddenReservationCount} ${hiddenReservationCount === 1 ? "slot" : "slots"} reserved`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}
