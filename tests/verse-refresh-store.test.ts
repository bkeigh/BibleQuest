import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectVerseRefreshCount,
  useQuestOS,
} from "@/lib/questos/store";
import { FREE_DAILY_VERSE_REFRESH_LIMIT } from "@/lib/questos/verse-engine";

describe("daily verse refresh allowance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T16:00:00-04:00"));
    useQuestOS.getState().clearAllData();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows exactly three successful free refreshes", () => {
    for (let count = 0; count < FREE_DAILY_VERSE_REFRESH_LIMIT; count += 1) {
      expect(useQuestOS.getState().refreshVerse(false)).toBe(true);
    }

    expect(useQuestOS.getState().refreshVerse(false)).toBe(false);
    expect(selectVerseRefreshCount(useQuestOS.getState())).toBe(
      FREE_DAILY_VERSE_REFRESH_LIMIT,
    );
  });

  it("keeps Plus refreshes unlimited and starts over on a new day", () => {
    for (let count = 0; count < 500; count += 1) {
      expect(useQuestOS.getState().refreshVerse(true)).toBe(true);
    }
    expect(selectVerseRefreshCount(useQuestOS.getState())).toBe(500);

    vi.setSystemTime(new Date("2026-07-22T08:00:00-04:00"));
    expect(selectVerseRefreshCount(useQuestOS.getState())).toBe(0);
    expect(useQuestOS.getState().refreshVerse(false)).toBe(true);
    expect(selectVerseRefreshCount(useQuestOS.getState())).toBe(1);
  });
});
