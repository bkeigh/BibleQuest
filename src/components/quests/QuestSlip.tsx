import Link from "next/link";
import type { QuestCategory, QuestTemplate } from "@/lib/questos/types";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon, CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";
import { IconClock, IconCheck } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes === 240) return "Half day";
  if (minutes === 480) return "Full day";
  return `${Math.round(minutes / 60)} hours`;
}

/** The one category → display-name map for every quest surface. */
export const CATEGORY_LABEL: Record<QuestCategory, string> = {
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

interface QuestSlipProps {
  quest: QuestTemplate;
  href?: string;
  className?: string;
  /**
   * Optional control (e.g. an add/remove button) rendered top-right,
   * OUTSIDE the link wrapper — so the card can navigate while the
   * action stays its own interactive element.
   */
  action?: React.ReactNode;
  /** This quest is picked for today — accent tint + badge. */
  picked?: boolean;
  /** This quest was completed today — done chip. */
  completed?: boolean;
}

/**
 * QuestSlip — a paper slip handed to the user, never a task-tracker row.
 */
export function QuestSlip({
  quest,
  href,
  className,
  action,
  picked,
  completed,
}: QuestSlipProps) {
  const badge = completed ? (
    <span className="pixel-frame ml-auto inline-flex shrink-0 items-center gap-1 bg-accent-surface px-2 py-0.5 font-pixel text-[0.875rem] text-accent-ink">
      <IconCheck size={12} /> Done
    </span>
  ) : picked ? (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-surface px-2 py-0.5 font-pixel text-[0.875rem] text-accent">
      <IconCheck size={12} /> Picked
    </span>
  ) : null;

  const inner = (
    <PaperCard
      interactive={Boolean(href)}
      padding="md"
      className={cn(
        "group h-full",
        (picked || completed) && "ring-1 ring-accent/35",
        className
      )}
    >
      <div className={cn("flex items-start gap-3.5", action ? "pr-8" : null)}>
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
            <span className="font-pixel text-[0.875rem] text-accent">
              {CATEGORY_LABEL[quest.category]}
            </span>
            {badge}
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

  const linked = href ? (
    <Link
      href={href}
      className="block h-full rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {inner}
    </Link>
  ) : (
    inner
  );

  if (action) {
    return (
      <div className="relative">
        {linked}
        <div className="absolute right-4 top-4">{action}</div>
      </div>
    );
  }
  return linked;
}
