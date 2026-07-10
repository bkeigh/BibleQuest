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
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconChevronRight } from "@/components/design-system/icons";

export function StreakCard({
  streak,
  dayKey,
}: {
  streak: StreakState;
  /** HomeScreen's rollover-watched day key, so the candle stays honest overnight. */
  dayKey: string;
}) {
  const t = useStrings();
  const days = displayStreak(streak, dayKey);
  const lit = isLitToday(streak, dayKey);

  return (
    <Link href="/app/journey" className="block">
      <PaperCard interactive padding="md" className="flex items-center gap-4">
        <span className="flex w-12 shrink-0 justify-center">
          <PixelIcon name={candleStage(days)} size={4} animate={lit} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent">
            {t.streak.title}
          </h2>
          {days > 0 && (
            <p className="mt-1 font-display text-subheading text-graphite">
              {fmt(t.streak.day, { n: days })}
            </p>
          )}
          <p className="mt-1 text-caption text-ash">
            {lit ? t.streak.lit : t.streak.unlit}
          </p>
        </div>
        <IconChevronRight className="shrink-0 text-fog" />
      </PaperCard>
    </Link>
  );
}
