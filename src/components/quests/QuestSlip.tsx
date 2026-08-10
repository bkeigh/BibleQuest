import Link from "next/link";
import type {
  DailyQuestStatus,
  QuestTemplate,
} from "@/lib/questos/types";
import {
  formatQuestDuration,
  QUEST_CATEGORY_LABEL,
} from "@/lib/questos/quest-presentation";
import { PaperCard } from "@/components/design-system/PaperCard";
import { ArtIcon, CATEGORY_ART } from "@/components/design-system/ArtIcon";
import {
  IconClock,
  IconCheck,
  IconBookmark,
} from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";
import { formatQuestWindowRemaining } from "@/lib/questos/quest-engine";

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
    <span className="art-frame ml-auto inline-flex shrink-0 items-center gap-1 bg-accent-surface px-2 py-0.5 font-art-label text-[0.875rem] text-accent-ink">
      <IconCheck size={12} /> Done
    </span>
  ) : displayStatus === "started" ? (
    <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-accent-surface px-2 py-0.5 font-art-label text-[0.875rem] text-accent-ink">
      In progress
    </span>
  ) : displayStatus === "assigned" || picked ? (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-surface px-2 py-0.5 font-art-label text-[0.875rem] text-accent">
      Ready
    </span>
  ) : saved ? (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-linen px-2 py-0.5 font-art-label text-[0.875rem] text-charcoal ring-1 ring-mist">
      <IconBookmark size={12} /> Saved
    </span>
  ) : null;

  const heading = (
    <h3 className="mt-1 font-display text-[1.1875rem] leading-snug text-graphite">
      {href ? (
        /* Overlay link: the pseudo-element covers the whole card, so the card
           is one tap target while the action buttons below stay real siblings
           rather than buttons nested inside an anchor. */
        <Link
          href={href}
          className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {quest.title}
        </Link>
      ) : (
        quest.title
      )}
    </h3>
  );

  return (
    <PaperCard
      interactive={Boolean(href)}
      padding="md"
      className={cn(
        "group relative h-full",
        (picked || completed || assignmentStatus) && "ring-1 ring-accent/35",
        className
      )}
    >
      {/* One header rail: the mark and its metadata on the left, the actions
          on the right. Everything below runs the full width of the card —
          an indented text column under a large sprite was leaving a third of
          the card empty on both sides. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Small enough to read as a category mark rather than an
              illustration; the artwork has its own space on the quest page. */}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <ArtIcon name={CATEGORY_ART[quest.category] ?? "leaf"} size={22} />
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-ash">
            <span className="inline-flex items-center gap-1">
              <IconClock size={13} />
              {formatQuestDuration(quest.durationMinutes)}
            </span>
            <span className="text-mist">·</span>
            <span className="font-art-label text-[0.875rem] text-accent">
              {QUEST_CATEGORY_LABEL[quest.category]}
            </span>
            {badge}
          </div>
        </div>
        {action && (
          <div className="relative z-10 flex shrink-0 items-center gap-1">
            {action}
          </div>
        )}
      </div>
      {heading}
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
      {/* Two lines of invitation, clamped. The scripture reference belongs to
          the quest page — on a shelf it was a fourth line of small type
          competing with the title for the same glance. */}
      {!compact && (
        <p className="mt-1.5 line-clamp-2 text-[0.9375rem] leading-relaxed text-charcoal">
          {quest.invitation}
        </p>
      )}
    </PaperCard>
  );
}
