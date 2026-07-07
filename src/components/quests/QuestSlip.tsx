import Link from "next/link";
import type { QuestTemplate } from "@/lib/questos/types";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon, CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";
import { IconClock } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes === 240) return "Half day";
  if (minutes === 480) return "Full day";
  return `${Math.round(minutes / 60)} hours`;
}

const CATEGORY_LABEL: Record<string, string> = {
  prayer: "Prayer",
  scripture: "Scripture",
  service: "Service",
  kindness: "Kindness",
  forgiveness: "Forgiveness",
  generosity: "Generosity",
  discipline: "Discipline",
  gratitude: "Gratitude",
  silence: "Silence",
  worship: "Worship",
  family: "Family",
  community: "Community",
  reflection: "Reflection",
  patience: "Patience",
};

/**
 * QuestSlip — a paper slip handed to the user, never a task-tracker row.
 */
export function QuestSlip({
  quest,
  href,
  className,
}: {
  quest: QuestTemplate;
  href?: string;
  className?: string;
}) {
  const inner = (
    <PaperCard
      interactive={Boolean(href)}
      padding="md"
      className={cn("group h-full", className)}
    >
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 rounded-[10px] bg-linen p-2 ring-1 ring-mist">
          <PixelIcon name={CATEGORY_SPRITE[quest.category] ?? "leaf"} size={5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-ash">
            <span className="inline-flex items-center gap-1">
              <IconClock size={13} />
              {formatDuration(quest.durationMinutes)}
            </span>
            <span className="text-mist">·</span>
            <span className="uppercase tracking-wide text-olive-500">
              {CATEGORY_LABEL[quest.category]}
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

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
