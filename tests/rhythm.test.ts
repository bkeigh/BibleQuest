import { beforeEach, describe, expect, it } from "vitest";
import {
  readRhythmState,
  resetRhythmClientForTests,
  saveRhythmBlock,
} from "@/lib/rhythm/client";
import {
  parseRhythmBlock,
  parseRhythmState,
  rhythmBlocksForDate,
} from "@/lib/rhythm/validation";
import type { RhythmBlock } from "@/lib/rhythm/types";

const MORNING: RhythmBlock = {
  id: "rhythm_morning1",
  label: "Morning",
  time: "08:00",
  days: [1, 2, 3, 4, 5],
  practices: ["quest", "guided_scripture"],
  fallbackPractice: null,
  createdAt: "2026-07-29T12:00:00.000Z",
  updatedAt: "2026-07-29T12:00:00.000Z",
};

describe("Rhythm validation", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRhythmClientForTests();
  });

  it("accepts one complete rhythm and normalizes ordering", () => {
    expect(
      parseRhythmBlock({
        ...MORNING,
        days: [5, 1, 3],
        practices: ["guided_scripture", "quest"],
      }),
    ).toMatchObject({
      days: [1, 3, 5],
      practices: ["quest", "guided_scripture"],
    });
  });

  it("rejects malformed clocks, duplicate days, and empty practices", () => {
    expect(parseRhythmBlock({ ...MORNING, time: "8:00" })).toBeNull();
    expect(parseRhythmBlock({ ...MORNING, days: [1, 1] })).toBeNull();
    expect(parseRhythmBlock({ ...MORNING, practices: [] })).toBeNull();
    expect(
      parseRhythmBlock({ ...MORNING, fallbackPractice: "quest" }),
    ).toBeNull();
    expect(
      parseRhythmBlock({
        ...MORNING,
        updatedAt: "2026-07-28T12:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("compares offset timestamps by their instant, not their text order", () => {
    expect(
      parseRhythmBlock({
        ...MORNING,
        createdAt: "2026-07-29T08:00:00-04:00",
        updatedAt: "2026-07-29T13:00:00+00:00",
      }),
    ).not.toBeNull();
    expect(
      parseRhythmBlock({
        ...MORNING,
        createdAt: "2026-07-29T08:00:00-04:00",
        updatedAt: "2026-07-29T11:59:59+00:00",
      }),
    ).toBeNull();
  });

  it("bounds the saved state to the Plus block limit", () => {
    expect(
      parseRhythmState({
        version: 1,
        blocks: Array.from({ length: 4 }, (_, index) => ({
          ...MORNING,
          id: `rhythm_block${index}`,
        })),
      }),
    ).toBeNull();
  });

  it("selects only today's blocks in clock order", () => {
    const evening: RhythmBlock = {
      ...MORNING,
      id: "rhythm_evening1",
      label: "Evening",
      time: "20:00",
    };
    const sunday: RhythmBlock = {
      ...MORNING,
      id: "rhythm_sunday01",
      label: "Sunday",
      days: [0],
    };
    const state = { version: 1 as const, blocks: [evening, sunday, MORNING] };
    expect(
      rhythmBlocksForDate(state, new Date("2026-07-29T12:00:00")),
    ).toEqual([MORNING, evening]);
    expect(
      rhythmBlocksForDate(state, new Date("2026-07-29T12:00:00"), false),
    ).toEqual([evening]);
  });

  it("preserves lapsed Plus rhythms without allowing Free mutation", () => {
    const second: RhythmBlock = {
      ...MORNING,
      id: "rhythm_second01",
      label: "Evening",
      createdAt: "2026-07-29T12:01:00.000Z",
      updatedAt: "2026-07-29T12:01:00.000Z",
    };
    expect(saveRhythmBlock(MORNING, true)).toBe(true);
    expect(saveRhythmBlock(second, true)).toBe(true);

    expect(
      saveRhythmBlock(
        {
          ...second,
          label: "Changed while Free",
          updatedAt: "2026-07-29T12:02:00.000Z",
        },
        false,
      ),
    ).toBe(false);
    expect(readRhythmState().blocks[1]?.label).toBe("Evening");
  });
});
