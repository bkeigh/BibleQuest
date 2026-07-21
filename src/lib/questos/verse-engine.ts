/**
 * Verse engine — daily verse rotation over the curated pool.
 * Deterministic by calendar day so everyone shares the same quiet rhythm,
 * cycling the pool without repeats until it wraps.
 *
 * `refresh` supports the gentle "Another verse" control: each refresh count
 * maps to one more deterministic pick for that day (never repeating a verse
 * already shown that day), so the choice is stable across re-renders and
 * reloads and resets on its own at midnight.
 */
import dailyVerses from "@/data/seed/daily-verses.json";
import {
  dayNumber,
  fromDateKey,
  hashString,
  seededRandom,
  toDateKey,
} from "@/lib/utils/dates";
import type { DailyVerse } from "./types";

const POOL = dailyVerses as DailyVerse[];

/** Limits free accounts to three successful daily-verse refreshes. */
export const FREE_DAILY_VERSE_REFRESH_LIMIT = 3;

/** Reports whether the next daily-verse refresh is allowed for this account. */
export function canRefreshDailyVerse(
  refreshCount: number,
  isPlus: boolean,
): boolean {
  if (isPlus) return true;
  return (
    Number.isInteger(refreshCount) &&
    refreshCount >= 0 &&
    refreshCount < FREE_DAILY_VERSE_REFRESH_LIMIT
  );
}

export function getDailyVerse(dateKey?: string, refresh = 0): DailyVerse {
  const key = dateKey ?? toDateKey();
  const day = dayNumber(fromDateKey(key));
  const len = POOL.length;
  const base = ((day % len) + len) % len;

  // Wrap the refresh count across the complete daily order so Plus accounts
  // can keep refreshing without sticking on the pool's final verse.
  const normalizedRefresh = Number.isFinite(refresh)
    ? Math.max(0, Math.floor(refresh))
    : 0;
  const steps = normalizedRefresh % len;
  if (steps === 0) return POOL[base];

  // Walk the same deterministic path for any given (day, refresh) pair,
  // skipping verses already shown today so refreshing always changes it.
  const shown = new Set([base]);
  let index = base;
  for (let i = 1; i <= steps; i++) {
    const rand = seededRandom(hashString(`${key}:verse:${i}`));
    let pick = Math.floor(rand() * len);
    while (shown.has(pick)) pick = (pick + 1) % len;
    shown.add(pick);
    index = pick;
  }
  return POOL[index];
}

export function getVersePool(): DailyVerse[] {
  return POOL;
}
