"use client";

/**
 * QuestAccordionCard — one quest on the Home feed shelf.
 *
 * Collapsed: sprite, meta row (duration · category · status), title, and
 * either step progress (once begun) or the scripture reference. Expanded:
 * the invitation, the next movement, a read-only step list, and the
 * lifecycle actions for its status.
 *
 * Collapse animation reuses the design-system Disclosure technique — CSS
 * grid-template-rows 0fr→1fr — so both reduced-motion kill-switches
 * flatten it automatically. The header is a real <button> with
 * aria-expanded/aria-controls; the collapsed region is inert while closed.
 */
import { useId } from "react";
import { useRouter } from "next/navigation";
import type { MyQuest, QuestStepKey, QuestTemplate } from "@/lib/questos/types";
import { useQuestOS } from "@/lib/questos/store";
import {
  QUEST_STEP_KEYS,
  checklistItemsForQuest,
  hasBegun,
} from "@/lib/questos/quest-steps";
import { useToast } from "@/components/design-system/Toast";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PixelIcon, CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";
import {
  IconCheck,
  IconChevronRight,
  IconClock,
} from "@/components/design-system/icons";
import { QuestStatusBadge, TodayBadge } from "./QuestStatusBadge";
import { QuestProgressIndicator } from "./QuestProgressIndicator";
import { formatDuration, CATEGORY_LABEL } from "./QuestSlip";
import { useStrings, fmt, type UIStrings } from "@/lib/i18n";
import { track } from "@/lib/analytics/events";
import { cn } from "@/lib/utils/cn";
import { usePlus } from "@/lib/revenuecat/usePlus";

/** The generic movement labels used when a quest has no required checklist. */
function stepLabels(t: UIStrings): Record<QuestStepKey, string> {
  return {
    scripture: t.myQuests.stepScripture,
    live: t.myQuests.stepLive,
    reflect: t.myQuests.stepReflect,
    pray: t.myQuests.stepPray,
  };
}

interface QuestAccordionCardProps {
  quest: QuestTemplate;
  entry: MyQuest;
  /** Picked for today — leads the feed with a gold chip. */
  today?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after an action that unmounts or relocates this card (pause,
   * archive, remove, reopen) so the parent can land keyboard focus
   * somewhere sensible instead of letting it drop to <body>.
   */
  onRelocate?: () => void;
}

export function QuestAccordionCard({
  quest,
  entry,
  today,
  open,
  onOpenChange,
  onRelocate,
}: QuestAccordionCardProps) {
  const t = useStrings();
  const { toast } = useToast();
  const router = useRouter();
  const pauseQuest = useQuestOS((s) => s.pauseQuest);
  const resumeQuest = useQuestOS((s) => s.resumeQuest);
  const archiveQuest = useQuestOS((s) => s.archiveQuest);
  const removeQuest = useQuestOS((s) => s.removeQuest);
  const reopenQuest = useQuestOS((s) => s.reopenQuest);
  const { isPlus } = usePlus();

  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;

  const begun = hasBegun(entry);
  const labels = stepLabels(t);
  const checklistItems = checklistItemsForQuest(quest);
  const displayedSteps =
    checklistItems.length > 0
      ? checklistItems
      : QUEST_STEP_KEYS.map((key) => ({ key, label: labels[key] }));
  const nextDisplayedStep = displayedSteps.find(
    (item) => !entry.stepsDone.includes(item.key)
  );
  const detailHref = `/app/quests/${quest.slug}`;

  function toggle() {
    const nextOpen = !open;
    onOpenChange(nextOpen);
    if (nextOpen) {
      track("quest_card_expanded", { category: quest.category });
    }
  }

  function goContinue() {
    // Paused walks wake on continue; a saved quest stays saved until the
    // person actually begins it on the quest page — navigation alone is
    // not a commitment, and "saved" would otherwise be unreachable again.
    if (entry.status === "paused") {
      resumeQuest(quest.slug);
    }
    router.push(detailHref);
  }

  const continueLabel =
    entry.status === "paused"
      ? t.myQuests.resumeCta
      : begun
        ? t.myQuests.continueCta
        : t.quests.begin;

  return (
    <PaperCard
      as="li"
      padding="none"
      className={cn(
        "list-none",
        entry.status === "completed" && "opacity-90",
        (entry.status === "paused" || entry.status === "archived") &&
          "opacity-80"
      )}
    >
      {/* Header — the whole row toggles the card. */}
      {/* No aria-label here: the accessible name computes from the rich
          content (duration, category, status, title, progress) — an
          override would hide all of it from screen readers. */}
      <button
        type="button"
        id={triggerId}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={toggle}
        className="flex w-full items-start gap-3.5 rounded-[var(--radius-card)] px-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-5"
      >
        <span className="mt-0.5 shrink-0 rounded-[10px] bg-linen p-2 ring-1 ring-mist">
          <PixelIcon name={CATEGORY_SPRITE[quest.category] ?? "leaf"} size={5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.75rem] text-ash">
            <span className="inline-flex items-center gap-1">
              <IconClock size={13} />
              {formatDuration(quest.durationMinutes)}
            </span>
            <span className="text-mist">·</span>
            <span className="font-pixel text-[0.875rem] text-accent">
              {CATEGORY_LABEL[quest.category]}
            </span>
            {today && <TodayBadge className="ml-auto" />}
            <QuestStatusBadge entry={entry} className={today ? "" : "ml-auto"} />
          </span>
          <span className="mt-1 block font-display text-[1.1875rem] leading-snug text-graphite">
            {quest.title}
          </span>
          <span className="mt-1.5 block">
            {begun && entry.status !== "completed" ? (
              <QuestProgressIndicator entry={entry} quest={quest} />
            ) : (
              <span className="text-[0.8125rem] italic text-ash">
                {quest.scriptureReference}
              </span>
            )}
          </span>
        </span>
        <IconChevronRight
          aria-hidden="true"
          className={cn(
            "mt-1 shrink-0 rotate-90 text-ash transition-transform duration-300 [transition-timing-function:var(--ease-gentle)]",
            open && "-rotate-90"
          )}
        />
      </button>

      {/* Collapse region — grid-rows technique, reduced-motion safe. */}
      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 [transition-timing-function:var(--ease-gentle)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div inert={!open} className="min-h-0 overflow-hidden">
          <div className="space-y-4 px-4 pb-4 sm:px-5">
            <p className="text-[0.9375rem] leading-relaxed text-charcoal">
              {quest.invitation}
            </p>

            {entry.status !== "completed" && entry.status !== "archived" && (
              <div>
                {nextDisplayedStep && begun && (
                  <p className="mb-2 text-caption text-accent">
                    {fmt(t.myQuests.nextStep, {
                      step: nextDisplayedStep.label,
                    })}
                  </p>
                )}
                <ul className="space-y-1.5">
                  {displayedSteps.map((item) => {
                    const done = entry.stepsDone.includes(item.key);
                    return (
                      <li
                        key={item.key}
                        className="flex items-center gap-2.5 text-small"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-[3px] ring-1",
                            done
                              ? "bg-accent text-[#fdfbf3] ring-accent"
                              : "bg-paper ring-mist"
                          )}
                        >
                          {done && <IconCheck size={11} />}
                        </span>
                        <span
                          className={cn(
                            done ? "text-ash line-through decoration-mist" : "text-charcoal"
                          )}
                        >
                          {item.label}
                        </span>
                        <span className="sr-only">
                          {done ? t.common.done : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {entry.timesCompleted > 1 && (
              <p className="text-caption text-ash">
                {fmt(t.myQuests.walkedTimes, { n: entry.timesCompleted })}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              {(entry.status === "active" ||
                entry.status === "paused" ||
                entry.status === "saved") && (
                <>
                  <GentleButton variant="primary" size="sm" onClick={goContinue}>
                    {continueLabel}
                  </GentleButton>
                  {entry.status === "active" && begun && (
                    <GentleButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        pauseQuest(quest.slug);
                        toast(t.myQuests.pausedToast);
                        onRelocate?.();
                      }}
                    >
                      {t.myQuests.pause}
                    </GentleButton>
                  )}
                </>
              )}
              {(entry.status === "completed" || entry.status === "archived") && (
                <>
                  <GentleButton
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      reopenQuest(quest.slug);
                      onRelocate?.();
                    }}
                  >
                    {t.myQuests.reopenCta}
                  </GentleButton>
                  {entry.status === "completed" && (
                    <GentleButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        archiveQuest(quest.slug, isPlus);
                        toast(t.myQuests.archivedToast);
                        onRelocate?.();
                      }}
                    >
                      {t.myQuests.archive}
                    </GentleButton>
                  )}
                </>
              )}
              <GentleButton
                variant="text"
                size="sm"
                className="text-ash hover:text-charcoal"
                onClick={() => {
                  removeQuest(quest.slug, isPlus);
                  toast(t.myQuests.removedToast);
                  onRelocate?.();
                }}
              >
                {t.myQuests.removeFromShelf}
              </GentleButton>
            </div>
          </div>
        </div>
      </div>
    </PaperCard>
  );
}
