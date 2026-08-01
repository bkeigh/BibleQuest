"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePlus } from "@/lib/billing/usePlus";
import { GREEN_FEATURES } from "@/lib/features/green";
import { useRhythmState } from "@/lib/rhythm/client";
import {
  RHYTHM_PRACTICE_LABELS,
  type RhythmPractice,
} from "@/lib/rhythm/types";
import {
  rhythmBlockForCurrentTime,
  rhythmBlocksForDate,
} from "@/lib/rhythm/validation";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconChevronRight } from "@/components/design-system/icons";

// Rhythm practices lead into existing formation surfaces without creating a
// second completion system or spiritual score.
const PRACTICE_HREF: Record<RhythmPractice, string> = {
  quest: "/app/quests",
  guided_scripture: "/app/guided",
  today_game: "/app/games",
  prayer: "/app/prayer",
  reflection: "/app/reflection",
};

/** Keeps disabled preview routes out of a previously saved rhythm. */
function practiceEnabled(practice: RhythmPractice): boolean {
  if (practice === "guided_scripture") return GREEN_FEATURES.guidedScripture;
  if (practice === "today_game") return GREEN_FEATURES.games;
  return true;
}

/** Shows the next useful rhythm for this local day as a calm set of links. */
export function RhythmTodayCard({
  dayKey,
  now,
}: {
  dayKey: string;
  now: number;
}) {
  const plus = usePlus();
  const state = useRhythmState();
  const date = useMemo(() => new Date(`${dayKey}T12:00:00`), [dayKey]);
  const localTime = useMemo(() => {
    const current = new Date(now);
    return `${String(current.getHours()).padStart(2, "0")}:${String(
      current.getMinutes(),
    ).padStart(2, "0")}`;
  }, [now]);
  const blocks = useMemo(
    () => rhythmBlocksForDate(state, date, plus.isPlus),
    [date, plus.isPlus, state],
  );
  const block = useMemo(
    () => rhythmBlockForCurrentTime(blocks, localTime),
    [blocks, localTime],
  );
  const practices = useMemo(
    () => block?.practices.filter(practiceEnabled) ?? [],
    [block],
  );

  if (!GREEN_FEATURES.rhythmBuilder) return null;

  if (!block && state.blocks.length === 0) {
    return (
      <Link href="/app/rhythm" className="block">
        <PaperCard
          interactive
          variant="quiet"
          padding="sm"
          className="flex min-h-20 items-center gap-4"
        >
          <PixelIcon name="lantern" size={56} />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[1.0625rem] text-graphite">
              Build a gentle weekly rhythm
            </span>
            <span className="mt-0.5 block text-caption text-ash">
              One plan is included. Missing a day never counts against you.
            </span>
          </span>
          <IconChevronRight className="shrink-0 text-fog" />
        </PaperCard>
      </Link>
    );
  }

  if (!block) return null;

  return (
    <PaperCard variant="quiet" padding="md">
      <div className="flex items-start gap-3">
        <PixelIcon name="lantern" size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-caption uppercase tracking-[0.12em] text-ash">
                My rhythm · {block.time}
              </p>
              <h2 className="mt-1 font-display text-[1.125rem] text-graphite">
                {block.label}
              </h2>
            </div>
            <Link
              href="/app/rhythm"
              className="inline-flex min-h-12 items-center gap-1 px-1 text-caption font-medium text-accent"
            >
              Adjust <IconChevronRight size={14} />
            </Link>
          </div>

          <nav aria-label={`${block.label} practices`} className="mt-3">
            {practices.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {practices.map((practice) => (
                  <li key={practice}>
                    <Link
                      href={PRACTICE_HREF[practice]}
                      className="inline-flex min-h-12 items-center rounded-full border border-mist bg-paper px-4 py-2.5 text-small text-charcoal transition-colors hover:border-accent/35 hover:text-accent"
                    >
                      {RHYTHM_PRACTICE_LABELS[practice]}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption leading-relaxed text-ash">
                These practices are temporarily unavailable. Adjust this
                rhythm to choose another gentle step.
              </p>
            )}
          </nav>

          {blocks.length > 1 && (
            <p className="mt-3 text-caption text-ash">
              {blocks.length - 1} other{" "}
              {blocks.length - 1 === 1 ? "rhythm is" : "rhythms are"} also
              scheduled today.
            </p>
          )}

          {plus.isPlus &&
            block.fallbackPractice &&
            practiceEnabled(block.fallbackPractice) && (
            <p className="mt-3 text-caption leading-relaxed text-ash">
              Busy day? Your gentle alternative is{" "}
              <Link
                href={PRACTICE_HREF[block.fallbackPractice]}
                className="text-accent underline"
              >
                {RHYTHM_PRACTICE_LABELS[block.fallbackPractice]}
              </Link>
              .
            </p>
            )}
        </div>
      </div>
    </PaperCard>
  );
}
