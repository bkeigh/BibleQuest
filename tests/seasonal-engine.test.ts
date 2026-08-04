import { describe, expect, it } from "vitest";
import { easterSunday, getCurrentSeason } from "@/lib/questos/seasonal-engine";
import { toDateKey } from "@/lib/utils/dates";

function localDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 9, 30);
}

function seasonOn(dateKey: string): string {
  return getCurrentSeason(localDate(dateKey)).key;
}

describe("easterSunday", () => {
  it("matches the published Gregorian dates", () => {
    const expected: Record<number, string> = {
      2024: "2024-03-31",
      2025: "2025-04-20",
      2026: "2026-04-05",
      2027: "2027-03-28",
      2038: "2038-04-25",
      2100: "2100-03-28",
    };
    for (const [year, dateKey] of Object.entries(expected)) {
      expect(toDateKey(easterSunday(Number(year)))).toBe(dateKey);
    }
  });

  it("always lands on a Sunday between March 22 and April 25", () => {
    for (let year = 2020; year <= 2060; year++) {
      const easter = easterSunday(year);
      expect(easter.getDay()).toBe(0);
      const key = toDateKey(easter);
      expect(key >= `${year}-03-22`).toBe(true);
      expect(key <= `${year}-04-25`).toBe(true);
    }
  });
});

describe("getCurrentSeason", () => {
  it("keeps Christmastide across the year boundary", () => {
    expect(seasonOn("2026-12-25")).toBe("christmas");
    expect(seasonOn("2026-12-31")).toBe("christmas");
    expect(seasonOn("2027-01-05")).toBe("christmas");
    expect(seasonOn("2027-01-06")).not.toBe("christmas");
  });

  it("reads December before Christmas as Advent", () => {
    expect(seasonOn("2026-12-01")).toBe("advent");
    expect(seasonOn("2026-12-24")).toBe("advent");
  });

  it("only treats late November as Advent from the fourth Sunday before Christmas", () => {
    // Christmas 2026 falls on a Friday, so Advent begins Sunday Nov 29.
    expect(seasonOn("2026-11-28")).toBe("ordinary_time");
    expect(seasonOn("2026-11-29")).toBe("advent");
    expect(seasonOn("2026-11-26")).toBe("ordinary_time");
  });

  it("walks the Easter-anchored seasons in order", () => {
    // Easter 2026 is April 5: Ash Wednesday Feb 18, Palm Sunday Mar 29,
    // Pentecost May 24.
    expect(seasonOn("2026-02-17")).toBe("ordinary_time");
    expect(seasonOn("2026-02-18")).toBe("lent");
    expect(seasonOn("2026-03-28")).toBe("lent");
    expect(seasonOn("2026-03-29")).toBe("holy_week");
    expect(seasonOn("2026-04-04")).toBe("holy_week");
    expect(seasonOn("2026-04-05")).toBe("easter");
    expect(seasonOn("2026-05-23")).toBe("easter");
    expect(seasonOn("2026-05-24")).toBe("pentecost");
    expect(seasonOn("2026-05-30")).toBe("pentecost");
    expect(seasonOn("2026-05-31")).toBe("ordinary_time");
  });

  it("describes every season it can return with UI-ready copy", () => {
    const keys = new Set<string>();
    const cursor = new Date(2026, 0, 1);
    while (cursor.getFullYear() === 2026) {
      const season = getCurrentSeason(new Date(cursor));
      keys.add(season.key);
      expect(season.label.length).toBeGreaterThan(0);
      expect(season.mood.length).toBeGreaterThan(0);
      expect(["olive", "marian", "gold", "violet", "rose"]).toContain(
        season.accent,
      );
      cursor.setDate(cursor.getDate() + 1);
    }
    expect([...keys].sort()).toEqual([
      "advent",
      "christmas",
      "easter",
      "holy_week",
      "lent",
      "ordinary_time",
      "pentecost",
    ]);
  });

  it("ignores the time of day and defaults to the current moment", () => {
    expect(getCurrentSeason(new Date(2026, 3, 5, 23, 59)).key).toBe("easter");
    expect(getCurrentSeason(new Date(2026, 3, 5, 0, 1)).key).toBe("easter");
    expect(getCurrentSeason().key).toBe(getCurrentSeason(new Date()).key);
  });
});
