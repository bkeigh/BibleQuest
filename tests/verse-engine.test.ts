import { describe, expect, it } from "vitest";

import {
  canRefreshDailyVerse,
  FREE_DAILY_VERSE_REFRESH_LIMIT,
  getDailyVerse,
  getVersePool,
} from "@/lib/questos/verse-engine";

describe("daily verse refreshes", () => {
  const dateKey = "2026-07-21";

  it("keeps each date and refresh count deterministic", () => {
    expect(getDailyVerse(dateKey, 17, "user-123")).toEqual(
      getDailyVerse(dateKey, 17, "user-123"),
    );
  });

  it("personalizes the daily rotation by account", () => {
    expect(getDailyVerse(dateKey, 0, "user-123").id).not.toBe(
      getDailyVerse(dateKey, 0, "user-456").id,
    );
  });

  it("shows every verse once before repeating the deterministic order", () => {
    const poolLength = getVersePool().length;
    const firstCycle = Array.from({ length: poolLength }, (_, refresh) =>
      getDailyVerse(dateKey, refresh, "user-123").id,
    );

    expect(new Set(firstCycle).size).toBe(poolLength);
    expect(getDailyVerse(dateKey, poolLength, "user-123")).toEqual(
      getDailyVerse(dateKey, 0, "user-123"),
    );
  });

  it("never returns the same verse on consecutive Plus-style refreshes", () => {
    const poolLength = getVersePool().length;
    const verses = Array.from({ length: poolLength * 3 + 2 }, (_, refresh) =>
      getDailyVerse(dateKey, refresh, "user-123").id,
    );

    for (let index = 1; index < verses.length; index += 1) {
      expect(verses[index]).not.toBe(verses[index - 1]);
    }
  });

  it("allows three free refreshes and unlimited Plus refreshes", () => {
    for (let count = 0; count < FREE_DAILY_VERSE_REFRESH_LIMIT; count += 1) {
      expect(canRefreshDailyVerse(count, false)).toBe(true);
    }

    expect(canRefreshDailyVerse(FREE_DAILY_VERSE_REFRESH_LIMIT, false)).toBe(
      false,
    );
    expect(canRefreshDailyVerse(10_000, true)).toBe(true);
  });

  it("fails closed for invalid free refresh counts", () => {
    expect(canRefreshDailyVerse(-1, false)).toBe(false);
    expect(canRefreshDailyVerse(1.5, false)).toBe(false);
    expect(canRefreshDailyVerse(Number.NaN, false)).toBe(false);
  });
});
