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
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { cn } from "@/lib/utils/cn";

export function StreakCard({
  streak,
  dayKey,
  tone = "default",
  className,
}: {
  streak: StreakState;
  /** HomeScreen's rollover-watched day key, so the candle stays honest overnight. */
  dayKey: string;
  /** Gold nameplates use warm ink instead of low-contrast theme accents. */
  tone?: "default" | "gold";
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
        tone === "gold" && "hover:bg-[#6f470f]/10",
        className
      )}
    >
      {/* Sized to the sprite. At h-12 the box was 48px around a taller candle,
          so the flame overflowed the top and `items-end` pushed it off centre. */}
      <span
        className={cn(
          "relative flex h-[4.25rem] items-end justify-center",
          tone === "gold" &&
            "before:absolute before:inset-x-1 before:bottom-0 before:h-12 before:rounded-full before:bg-white/28 before:blur-sm",
        )}
      >
        <ArtIcon
          name={candleStage(days)}
          size={66}
          animate={lit}
          className="relative"
        />
      </span>
      <span
        className={cn(
          "mt-1 font-art-label text-[0.875rem] leading-none uppercase tracking-[0.05em] max-[430px]:text-[0.6875rem] max-[430px]:leading-tight max-[430px]:tracking-[0.03em]",
          tone === "gold"
            ? "rounded-full border border-[#9f6a1f]/25 bg-[#fff9df]/55 px-2 py-1 text-[#633c0a] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
            : "text-gilt",
        )}
      >
        {days > 0 ? fmt(t.streak.day, { n: days }) : t.streak.title}
      </span>
    </Link>
  );
}
