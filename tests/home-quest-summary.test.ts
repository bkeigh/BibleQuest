import { describe, expect, it } from "vitest";
import { homeQuestSummary } from "@/lib/questos/home-quest-summary";

describe("Home quest summary", () => {
  it("invites a person to choose when no quest or reservation exists", () => {
    expect(
      homeQuestSummary({
        activeCount: 0,
        readyCount: 0,
        completedCount: 0,
        visibleCount: 0,
        occupiedCount: 0,
        hiddenReservationCount: 0,
      }),
    ).toBe("Choose a quest");
  });

  it("names hidden reservations without exposing noisy slot arithmetic", () => {
    expect(
      homeQuestSummary({
        activeCount: 0,
        readyCount: 0,
        completedCount: 0,
        visibleCount: 0,
        occupiedCount: 2,
        hiddenReservationCount: 2,
      }),
    ).toBe("2 slots reserved");
  });

  it("keeps mixed quest states readable while the list is closed", () => {
    expect(
      homeQuestSummary({
        activeCount: 1,
        readyCount: 2,
        completedCount: 1,
        visibleCount: 4,
        occupiedCount: 4,
        hiddenReservationCount: 0,
      }),
    ).toBe("1 active · 2 ready · 1 complete");
  });

  it("keeps a hidden reservation visible beside real quest counts", () => {
    expect(
      homeQuestSummary({
        activeCount: 1,
        readyCount: 1,
        completedCount: 0,
        visibleCount: 2,
        occupiedCount: 3,
        hiddenReservationCount: 1,
      }),
    ).toBe("1 active · 1 ready · 1 slot reserved");
  });

  it("uses a calmer all-complete summary", () => {
    expect(
      homeQuestSummary({
        activeCount: 0,
        readyCount: 0,
        completedCount: 3,
        visibleCount: 3,
        occupiedCount: 3,
        hiddenReservationCount: 0,
      }),
    ).toBe("3 of 3 complete");
  });

  it("retains reserved slots in an all-complete summary", () => {
    expect(
      homeQuestSummary({
        activeCount: 0,
        readyCount: 0,
        completedCount: 2,
        visibleCount: 2,
        occupiedCount: 3,
        hiddenReservationCount: 1,
      }),
    ).toBe("2 of 2 complete · 1 slot reserved");
  });
});
