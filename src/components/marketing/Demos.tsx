import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon, CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";
import { IconClock } from "@/components/design-system/icons";
import type { QuestTemplate } from "@/lib/questos/types";

/** Presentational (non-interactive) versions of the app cards for marketing.
 * The verse demo lives in ./VerseDemo.tsx — it's interactive (shuffle). */

/** Local copy of the app's duration formatter — keeps marketing decoupled from app components. */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes === 240) return "Half day";
  if (minutes === 480) return "Full day";
  return `${Math.round(minutes / 60)} hours`;
}

export function QuestDemo({ quest }: { quest: QuestTemplate }) {
  return (
    <PaperCard variant="paper" padding="md">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 rounded-[10px] bg-linen p-2 ring-1 ring-mist">
          <PixelIcon name={CATEGORY_SPRITE[quest.category] ?? "leaf"} size={5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[0.75rem] text-ash">
            <IconClock size={13} />
            {formatDuration(quest.durationMinutes)}
            <span className="text-mist">·</span>
            <span className="font-pixel text-[0.875rem] uppercase tracking-wide text-accent">
              {quest.category}
            </span>
          </div>
          <h3 className="mt-1 font-display text-[1.1875rem] leading-snug text-graphite">
            {quest.title}
          </h3>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-charcoal">
            {quest.invitation}
          </p>
          <p className="mt-2.5 text-[0.8125rem] italic text-ash">
            {quest.scriptureReference}
          </p>
        </div>
      </div>
    </PaperCard>
  );
}

export function PrayerDemo() {
  return (
    <PaperCard variant="paper" padding="md">
      <div className="flex items-start gap-3">
        <PixelIcon name="candle" size={5} />
        <div>
          <h3 className="font-display text-[1.125rem] text-graphite">
            Before tomorrow’s conversation
          </h3>
          <p className="mt-1 text-[1rem] leading-relaxed text-charcoal">
            Lord, give me the right words tomorrow — and the patience to
            listen first.
          </p>
          <p className="mt-2 text-[0.75rem] text-ash">Private by default</p>
        </div>
      </div>
    </PaperCard>
  );
}
