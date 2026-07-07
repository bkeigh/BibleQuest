/**
 * Verse engine — daily verse rotation over the curated pool.
 * Deterministic by calendar day so everyone shares the same quiet rhythm,
 * cycling the pool without repeats until it wraps.
 */
import dailyVerses from "@/data/seed/daily-verses.json";
import { dayNumber, fromDateKey } from "@/lib/utils/dates";
import type { DailyVerse } from "./types";

const POOL = dailyVerses as DailyVerse[];

export function getDailyVerse(dateKey?: string): DailyVerse {
  const day = dateKey ? dayNumber(fromDateKey(dateKey)) : dayNumber();
  return POOL[((day % POOL.length) + POOL.length) % POOL.length];
}

export function getVersePool(): DailyVerse[] {
  return POOL;
}
