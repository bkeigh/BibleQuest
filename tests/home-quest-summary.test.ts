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
});
