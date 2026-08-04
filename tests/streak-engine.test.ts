import { describe, expect, it, vi } from "vitest";
import {
  advanceStreak,
  CANDLE_STAGES,
  candleStage,
  displayStreak,
  isLitToday,
} from "@/lib/questos/streak-engine";
import { emptyStreak, type StreakState } from "@/lib/questos/types";

describe("advanceStreak", () => {
  it("lights the first candle from an empty streak", () => {
    expect(advanceStreak(emptyStreak(), "2026-07-16")).toEqual({
      current: 1,
      longest: 1,
      lastActiveDateKey: "2026-07-16",
    });
  });

  it("is idempotent within the same day", () => {
    const streak: StreakState = {
      current: 3,
      longest: 5,
      lastActiveDateKey: "2026-07-16",
    };
    expect(advanceStreak(streak, "2026-07-16")).toBe(streak);
  });

  it("grows on consecutive days and raises the longest run", () => {
    const streak: StreakState = {
      current: 4,
      longest: 4,
      lastActiveDateKey: "2026-07-16",
    };
    expect(advanceStreak(streak, "2026-07-17")).toEqual({
      current: 5,
      longest: 5,
      lastActiveDateKey: "2026-07-17",
    });
  });

  it("restarts quietly at 1 after a missed day without losing the record", () => {
    const streak: StreakState = {
      current: 9,
      longest: 12,
      lastActiveDateKey: "2026-07-16",
    };
    expect(advanceStreak(streak, "2026-07-19")).toEqual({
      current: 1,
      longest: 12,
      lastActiveDateKey: "2026-07-19",
    });
  });

  it("crosses month and year boundaries as ordinary consecutive days", () => {
    expect(
      advanceStreak(
        { current: 2, longest: 2, lastActiveDateKey: "2026-12-31" },
        "2027-01-01",
      ),
    ).toEqual({ current: 3, longest: 3, lastActiveDateKey: "2027-01-01" });
  });

  it("leaves the streak untouched when the device clock goes backwards", () => {
    const streak: StreakState = {
      current: 6,
      longest: 6,
      lastActiveDateKey: "2026-07-16",
    };
    expect(advanceStreak(streak, "2026-07-15")).toBe(streak);
  });

  it("defaults to today when no date key is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 16, 8, 0));
    expect(advanceStreak(emptyStreak())).toEqual({
      current: 1,
      longest: 1,
      lastActiveDateKey: "2026-07-16",
    });
    vi.useRealTimers();
  });
});

describe("isLitToday and displayStreak", () => {
  const streak: StreakState = {
    current: 4,
    longest: 7,
    lastActiveDateKey: "2026-07-16",
  };

  it("reports the candle lit only on the day of the last action", () => {
    expect(isLitToday(streak, "2026-07-16")).toBe(true);
    expect(isLitToday(streak, "2026-07-17")).toBe(false);
    expect(isLitToday(emptyStreak(), "2026-07-16")).toBe(false);
  });

  it("carries yesterday's run through the next day, then reads as ready to relight", () => {
    expect(displayStreak(streak, "2026-07-16")).toBe(4);
    expect(displayStreak(streak, "2026-07-17")).toBe(4);
    expect(displayStreak(streak, "2026-07-18")).toBe(0);
    expect(displayStreak(emptyStreak(), "2026-07-18")).toBe(0);
  });

  it("defaults both helpers to the current local day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 16, 21, 0));
    expect(isLitToday(streak)).toBe(true);
    expect(displayStreak(streak)).toBe(4);
    vi.useRealTimers();
  });
});

describe("candleStage", () => {
  it("moves through every stage in order as the rhythm grows", () => {
    expect(candleStage(0)).toBe("candle-unlit");
    expect(candleStage(-3)).toBe("candle-unlit");
    expect(candleStage(1)).toBe("candle-small");
    expect(candleStage(2)).toBe("candle-small");
    expect(candleStage(3)).toBe("candle-steady");
    expect(candleStage(6)).toBe("candle-steady");
    expect(candleStage(7)).toBe("candle-sparks");
    expect(candleStage(13)).toBe("candle-sparks");
    expect(candleStage(14)).toBe("candle-halo");
    expect(candleStage(400)).toBe("candle-halo");
  });

  it("never regresses and reaches every declared stage", () => {
    const reached: string[] = [];
    let previous = -1;
    for (let day = 0; day <= 30; day++) {
      const index = CANDLE_STAGES.indexOf(candleStage(day));
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
      if (!reached.includes(CANDLE_STAGES[index])) {
        reached.push(CANDLE_STAGES[index]);
      }
    }
    expect(reached).toEqual([...CANDLE_STAGES]);
  });
});
