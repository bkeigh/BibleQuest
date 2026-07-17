"use client";

/**
 * StreakCard — "Today's light", the candle on the home screen.
 *
 * A gentle daily rhythm, never a scoreboard (Codex: no shame, nothing to
 * lose). The flame grows with consecutive days; an unlit day simply offers
 * one small step, and a zero count is never shown — the candle just waits.
 */
import Link from "next/link";
import type { StreakState } from "@/lib/questos/types";
import {
  candleStage,
  displayStreak,
  isLitToday,
} from "@/lib/questos/streak-engine";
import { useStrings, fmt } from "@/lib/i18n";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { cn } from "@/lib/utils/cn";

export function StreakCard({
  streak,
  dayKey,
  className,
}: {
  streak: StreakState;
  /** HomeScreen's rollover-watched day key, so the candle stays honest overnight. */
  dayKey: string;
  className?: string;
}) {
  const t = useStrings();
  const days = displayStreak(streak, dayKey);
  const lit = isLitToday(streak, dayKey);

  return (
    <Link
      href="/app/journey"
      aria-label={`${t.streak.title}. ${days > 0 ? fmt(t.streak.day, { n: days }) : t.streak.unlit}`}
      className={cn(
        "group flex min-w-[4.75rem] shrink-0 flex-col items-center rounded-lg px-2 py-1.5 text-center transition-colors duration-300 hover:bg-gold-500/10",
        className
      )}
    >
      <span className="flex h-12 items-end justify-center">
        <PixelIcon name={candleStage(days)} size={4} animate={lit} />
      </span>
      <span className="mt-1 font-pixel text-[0.875rem] leading-none uppercase tracking-[0.05em] text-gilt">
        {days > 0 ? fmt(t.streak.day, { n: days }) : t.streak.title}
      </span>
    </Link>
  );
}
