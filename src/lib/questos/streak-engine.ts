/**
 * Streak engine — the candle.
 *
 * BibleQuest-native rules (Codex spirit: gentle consistency, never pressure):
 *  - A day is "active" after any meaningful action (quest, prayer,
 *    reflection, chapter read). Merely opening the app doesn't count.
 *  - Consecutive active days grow the flame. A missed day quietly starts
 *    the next candle at 1 — there is no "lost streak" state, no shame copy,
 *    and nothing in the UI ever counts down or turns red.
 *  - The candle visual has five states so the art stays replaceable
 *    (see pixel-assets registry: candle-unlit … candle-halo).
 */
import { daysBetween, toDateKey } from "@/lib/utils/dates";
import type { StreakState } from "./types";

/**
 * Advance the streak for an action happening on `dateKey` (defaults to
 * today). Pure — returns the next state, or the same reference when the
 * day was already counted (safe to call on every action).
 */
export function advanceStreak(
  streak: StreakState,
  dateKey: string = toDateKey()
): StreakState {
  if (streak.lastActiveDateKey === dateKey) return streak;
  const gap = streak.lastActiveDateKey
    ? daysBetween(streak.lastActiveDateKey, dateKey)
    : Infinity;
  // Same-day double calls are handled above. A backwards clock (gap <= 0)
  // changes nothing — keeping the count AND the anchor, so the streak
  // doesn't read as broken once the clock corrects itself.
  if (gap <= 0) return streak;
  const current = gap === 1 ? streak.current + 1 : 1;
  return {
    current,
    longest: Math.max(streak.longest, current),
    lastActiveDateKey: dateKey,
  };
}

/** Whether the candle is lit for `todayKey` (an action happened today). */
export function isLitToday(
  streak: StreakState,
  todayKey: string = toDateKey()
): boolean {
  return streak.lastActiveDateKey === todayKey;
}

/**
 * How many consecutive days the rhythm is at, as the user experiences it
 * today: yesterday's run still counts this morning (the candle carries
 * until the day is over), and an older run reads as 0 — ready to relight.
 */
export function displayStreak(
  streak: StreakState,
  todayKey: string = toDateKey()
): number {
  if (!streak.lastActiveDateKey) return 0;
  const gap = daysBetween(streak.lastActiveDateKey, todayKey);
  return gap <= 1 ? streak.current : 0;
}

/** Every stage the candle can be in, in order. Exported so a test can walk them. */
export const CANDLE_STAGES = [
  "candle-unlit",
  "candle-small",
  "candle-steady",
  "candle-sparks",
  "candle-halo",
] as const;

export type CandleStage = (typeof CANDLE_STAGES)[number];

/**
 * Candle art stage for a streak. Thresholds are deliberately gentle:
 * the flame appears on day 1 and the halo within two weeks — after that
 * it simply stays warm.
 */
export function candleStage(days: number): CandleStage {
  if (days <= 0) return "candle-unlit";
  if (days <= 2) return "candle-small";
  if (days <= 6) return "candle-steady";
  if (days <= 13) return "candle-sparks";
  return "candle-halo";
}
