/**
 * Seasonal engine — adapts atmosphere and content to the Christian year.
 *
 * V1 uses a real computus (Anonymous Gregorian algorithm) for Easter-anchored
 * seasons and approximate fixed dates for Advent/Christmas. Tradition-specific
 * calendar precision is a documented later pass.
 */
import type { SeasonKey } from "./types";

export interface SeasonInfo {
  key: SeasonKey;
  label: string;
  mood: string;
  /** Accent token names usable by the UI. */
  accent: "olive" | "marian" | "gold" | "violet" | "rose";
}

const SEASONS: Record<SeasonKey, SeasonInfo> = {
  ordinary_time: {
    key: "ordinary_time",
    label: "Ordinary Time",
    mood: "growth, patience, daily faithfulness",
    accent: "olive",
  },
  advent: {
    key: "advent",
    label: "Advent",
    mood: "waiting, hope, preparation",
    accent: "marian",
  },
  christmas: {
    key: "christmas",
    label: "Christmas",
    mood: "joy, warmth, generosity",
    accent: "gold",
  },
  lent: {
    key: "lent",
    label: "Lent",
    mood: "reflection, simplicity, mercy",
    accent: "violet",
  },
  holy_week: {
    key: "holy_week",
    label: "Holy Week",
    mood: "reverence, stillness, love",
    accent: "violet",
  },
  easter: {
    key: "easter",
    label: "Easter",
    mood: "light, renewal, life",
    accent: "gold",
  },
  pentecost: {
    key: "pentecost",
    label: "Pentecost",
    mood: "courage, Spirit, unity",
    accent: "rose",
  },
};

/** Easter Sunday for a given year (Gregorian computus). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameOrAfter(a: Date, b: Date): boolean {
  return a.getTime() >= b.getTime();
}

function sameOrBefore(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime();
}

export function getCurrentSeason(now: Date = new Date()): SeasonInfo {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const year = today.getFullYear();

  // Christmastide first (spans year boundary): Dec 25 – Jan 5.
  if (
    (today.getMonth() === 11 && today.getDate() >= 25) ||
    (today.getMonth() === 0 && today.getDate() <= 5)
  ) {
    return SEASONS.christmas;
  }

  // Advent: the four Sundays before Christmas (approximate — from the
  // Sunday closest to Nov 30 through Dec 24).
  if (today.getMonth() === 11 && today.getDate() <= 24) {
    return SEASONS.advent;
  }
  if (today.getMonth() === 10 && today.getDate() >= 27) {
    // Advent can begin in late November.
    const christmas = new Date(year, 11, 25);
    const fourthSundayBefore = addDays(
      christmas,
      -(21 + ((christmas.getDay() + 6) % 7) + 1)
    );
    if (sameOrAfter(today, fourthSundayBefore)) return SEASONS.advent;
  }

  const easter = easterSunday(year);
  const ashWednesday = addDays(easter, -46);
  const palmSunday = addDays(easter, -7);
  const pentecost = addDays(easter, 49);

  if (sameOrAfter(today, ashWednesday) && today < palmSunday) {
    return SEASONS.lent;
  }
  if (sameOrAfter(today, palmSunday) && today < easter) {
    return SEASONS.holy_week;
  }
  if (sameOrAfter(today, easter) && today < pentecost) {
    return SEASONS.easter;
  }
  if (
    sameOrAfter(today, pentecost) &&
    sameOrBefore(today, addDays(pentecost, 6))
  ) {
    return SEASONS.pentecost;
  }

  return SEASONS.ordinary_time;
}

export function getSeasonInfo(key: SeasonKey): SeasonInfo {
  return SEASONS[key];
}
