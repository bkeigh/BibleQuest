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
        "group flex w-16 shrink-0 flex-col items-center rounded-lg px-1 py-1.5 text-center transition-colors duration-300 hover:bg-gold-500/10 max-[360px]:w-14 min-[431px]:w-auto min-[431px]:min-w-[4.75rem] min-[431px]:px-2",
        className
      )}
    >
      {/* Sized to the sprite. At h-12 the box was 48px around a taller candle,
          so the flame overflowed the top and `items-end` pushed it off centre. */}
      <span className="flex h-[4.5rem] items-end justify-center">
        <PixelIcon name={candleStage(days)} size={68} animate={lit} />
      </span>
      <span className="mt-1 font-pixel text-[0.875rem] leading-none uppercase tracking-[0.05em] text-gilt max-[430px]:text-[0.6875rem] max-[430px]:leading-tight max-[430px]:tracking-[0.03em]">
        {days > 0 ? fmt(t.streak.day, { n: days }) : t.streak.title}
      </span>
    </Link>
  );
}
