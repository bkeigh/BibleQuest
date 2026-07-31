import Link from "next/link";
import type {
  DailyQuestStatus,
  QuestCategory,
  QuestTemplate,
} from "@/lib/questos/types";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon, CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";
import {
  IconClock,
  IconCheck,
  IconBookmark,
} from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";
import { formatQuestWindowRemaining } from "@/lib/questos/quest-engine";

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
  /** This quest is saved for later on the shelf — quiet bookmark chip. */
  saved?: boolean;
  /** Rolling-window state, used to distinguish ready from in-progress. */
  assignmentStatus?: DailyQuestStatus;
  /** End of the rolling 24-hour slot occupied by this quest. */
  expiresAt?: string;
  /**
   * Compact: sprite chip, title, meta row, and badges only — the invitation
   * and scripture wait on the quest page. For suggestion shelves, where the
   * card should pull you in, not read it all to you.
   */
  compact?: boolean;
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
  saved,
  assignmentStatus,
  expiresAt,
  compact,
}: QuestSlipProps) {
  const displayStatus = completed ? "completed" : assignmentStatus;
  const badge = displayStatus === "completed" ? (
    <span className="pixel-frame ml-auto inline-flex shrink-0 items-center gap-1 bg-accent-surface px-2 py-0.5 font-pixel text-[0.875rem] text-accent-ink">
      <IconCheck size={12} /> Done
    </span>
  ) : displayStatus === "started" ? (
    <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-accent-surface px-2 py-0.5 font-pixel text-[0.875rem] text-accent-ink">
      In progress
    </span>
  ) : displayStatus === "assigned" || picked ? (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-surface px-2 py-0.5 font-pixel text-[0.875rem] text-accent">
      Ready
    </span>
  ) : saved ? (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-linen px-2 py-0.5 font-pixel text-[0.875rem] text-charcoal ring-1 ring-mist">
      <IconBookmark size={12} /> Saved
    </span>
  ) : null;

  const inner = (
    <PaperCard
      interactive={Boolean(href)}
      padding="md"
      className={cn(
        "group h-full",
        (picked || completed || assignmentStatus) && "ring-1 ring-accent/35",
        className
      )}
    >
      {/* The action sits absolutely at right-4 and is 44px wide, so the content
          must clear 60px plus a gap or the metadata row runs under it. */}
      <div className={cn("flex items-start gap-3.5", action ? "pr-[4.5rem]" : null)}>
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
          {expiresAt && (
            <time
              dateTime={expiresAt}
              title={new Date(expiresAt).toLocaleString()}
              className="mt-1 block text-[0.75rem] font-medium text-accent"
            >
              {completed
                ? `Slot resets · ${formatQuestWindowRemaining(expiresAt)}`
                : `${formatQuestWindowRemaining(expiresAt).replace(" left", " to complete")}`}
            </time>
          )}
          {displayStatus === "started" && (
            <span className="mt-1 block text-[0.75rem] font-medium text-accent">
              Open to continue
            </span>
          )}
          {!compact && (
            <>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-charcoal">
                {quest.invitation}
              </p>
              <p className="mt-2.5 text-[0.8125rem] italic text-ash">
                {quest.scriptureReference}
              </p>
            </>
          )}
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
