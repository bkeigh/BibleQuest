"use client";

/**
 * One canonical Quest-board card. Its state controls one exact primary action,
 * while supporting content expands inline without forcing route navigation.
 */
import { useId, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type {
  DailyQuestAssignment,
  QuestTemplate,
} from "@/lib/questos/types";
import { useQuestOS } from "@/lib/questos/store";
import {
  checklistItemsForQuest,
  isQuestChecklistComplete,
} from "@/lib/questos/quest-steps";
import {
  formatQuestWindowRemaining,
  isQuestWindowOpen,
} from "@/lib/questos/quest-engine";
import { usePlus } from "@/lib/billing/usePlus";
import { useToast } from "@/components/design-system/Toast";
import { PaperCard } from "@/components/design-system/PaperCard";
import {
  GentleButton,
  GentleLink,
} from "@/components/design-system/GentleButton";
import {
  CATEGORY_SPRITE,
  PixelIcon,
} from "@/components/design-system/PixelIcon";
import {
  IconCheck,
  IconChevronRight,
  IconClock,
} from "@/components/design-system/icons";
import { CATEGORY_LABEL, formatDuration } from "./QuestSlip";
import { cleanVerseText } from "@/lib/utils/scripture";
import { cn } from "@/lib/utils/cn";

export type QuestBoardCardState = "ready" | "active" | "completed";

interface QuestBoardCardProps {
  quest: QuestTemplate;
  assignment?: DailyQuestAssignment;
  state: QuestBoardCardState;
  now: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransition: (quest: QuestTemplate, destination: QuestBoardCardState) => void;
  onCompleted: (quest: QuestTemplate) => void;
}

export function QuestBoardCard({
  quest,
  assignment,
  state,
  now,
  open,
  onOpenChange,
  onTransition,
  onCompleted,
}: QuestBoardCardProps) {
  const { toast } = useToast();
  const { isPlus } = usePlus();
  const entry = useQuestOS((store) => store.myQuests[quest.slug]);
  const reflections = useQuestOS((store) => store.reflections);
  const startQuest = useQuestOS((store) => store.startQuest);
  const unpickQuest = useQuestOS((store) => store.unpickQuest);
  const removeQuest = useQuestOS((store) => store.removeQuest);
  const completeQuest = useQuestOS((store) => store.completeQuestBySlug);
  const markQuestStep = useQuestOS((store) => store.markQuestStep);
  const cardRef = useRef<HTMLLIElement>(null);
  const nextStepRef = useRef<HTMLButtonElement>(null);
  const contentId = useId();

  const checklist = checklistItemsForQuest(quest);
  const requiredComplete = isQuestChecklistComplete(quest, entry);
  const checklistDone = checklist.filter((item) =>
    entry?.stepsDone.includes(item.key),
  ).length;
  const activeWindowOpen =
    state === "active" &&
    Boolean(assignment && isQuestWindowOpen(assignment, now));
  const expired = state === "active" && !activeWindowOpen;
  const readyToFinish =
    state === "active" && checklist.length > 0 && requiredComplete;
  const latestReflection = reflections
    .filter((reflection) => reflection.relatedQuestSlug === quest.slug)
    .at(-1);

  const statusLabel =
    state === "ready"
      ? "Ready"
      : state === "completed"
        ? "Completed"
        : expired
          ? "Window ended"
          : readyToFinish
            ? "Ready to finish"
            : "Active";

  /** Begins or rearms a quest without leaving the board. */
  function beginOrResume() {
    if (!startQuest(quest.slug, isPlus)) {
      toast("All three quest spots are filled. Finish or remove one first.");
      return;
    }
    onTransition(quest, "active");
  }

  /** Completes now; the parent owns the optional post-completion sheet. */
  function finish() {
    const result = completeQuest(quest.slug);
    if (result.completed) {
      onTransition(quest, "completed");
      onCompleted(quest);
      return;
    }
    if (result.reason === "checklist_incomplete") {
      toast("Finish the required quest steps first.");
    } else if (result.reason === "window_closed") {
      toast("This quest window ended. Resume it before finishing.");
    } else if (result.reason === "not_started") {
      toast("Begin this quest before finishing it.");
    } else {
      toast("This quest is already complete.");
    }
  }

  /** Opens the inline content and moves focus to the next requirement. */
  function continueInline() {
    onOpenChange(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => nextStepRef.current?.focus());
    });
  }

  const primaryAction =
    state === "ready" ? (
      <GentleButton variant="primary" size="sm" onClick={beginOrResume}>
        Begin
      </GentleButton>
    ) : state === "completed" ? (
      latestReflection ? (
        <GentleButton
          variant="outline"
          size="sm"
          onClick={() => onOpenChange(true)}
        >
          View reflection
        </GentleButton>
      ) : (
        <GentleLink variant="outline" size="sm" href="/app/journey">
          See in Journey
        </GentleLink>
      )
    ) : expired ? (
      <GentleButton variant="primary" size="sm" onClick={beginOrResume}>
        Resume quest
      </GentleButton>
    ) : readyToFinish ? (
      <GentleButton variant="primary" size="sm" onClick={finish}>
        <IconCheck size={16} /> Finish quest
      </GentleButton>
    ) : checklist.length > 0 ? (
      <GentleButton variant="primary" size="sm" onClick={continueInline}>
        Continue
      </GentleButton>
    ) : (
      <GentleButton variant="primary" size="sm" onClick={finish}>
        <IconCheck size={16} /> Mark complete
      </GentleButton>
    );

  return (
    <motion.li
      ref={cardRef}
      data-quest-card={quest.slug}
      data-quest-card-state={state}
      tabIndex={-1}
      className="list-none scroll-mt-28 outline-none"
      // A local entrance avoids Safari's stale shared-layout projections while
      // still making a card's destination apparent after a state transition.
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <PaperCard padding="none" className="overflow-hidden">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 px-4 pt-4 sm:px-5">
          <span className="mt-0.5 shrink-0 rounded-[10px] bg-linen p-2 ring-1 ring-mist">
            <PixelIcon
              name={CATEGORY_SPRITE[quest.category] ?? "leaf"}
              size={5}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.75rem] text-ash">
              <span className="inline-flex items-center gap-1">
                <IconClock size={13} />
                {formatDuration(quest.durationMinutes)}
              </span>
              <span className="text-mist">·</span>
              <span className="font-pixel text-[0.875rem] text-accent">
                {CATEGORY_LABEL[quest.category]}
              </span>
            </div>
            <span
              className={cn(
                "mt-2 inline-flex rounded-full px-2 py-0.5 font-pixel text-[0.875rem]",
                state === "completed" || readyToFinish
                  ? "bg-accent-surface text-accent-ink"
                  : expired
                    ? "bg-linen text-ash ring-1 ring-mist"
                    : "bg-accent-surface text-accent",
              )}
            >
              {statusLabel}
            </span>
          </div>
          <div className="col-span-2 min-w-0 pt-3">
            <h4 className="font-display text-[1.1875rem] leading-snug text-graphite">
              {quest.title}
            </h4>
            {state === "active" && activeWindowOpen && assignment ? (
              <time
                dateTime={assignment.expiresAt}
                title={new Date(assignment.expiresAt).toLocaleString()}
                className="mt-1 block text-caption font-medium text-accent"
              >
                {formatQuestWindowRemaining(assignment.expiresAt, now)}
              </time>
            ) : state === "ready" ? (
              <p className="mt-1 text-caption text-ash">
                Your 24-hour window starts when you begin.
              </p>
            ) : null}
            {state === "active" && checklist.length > 0 && (
              <p className="mt-1.5 text-caption text-ash">
                {checklistDone} of {checklist.length} required steps
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 px-4 pb-4 pt-3 sm:px-5">
          {primaryAction}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => onOpenChange(!open)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] px-2 text-small text-ash transition-colors hover:bg-linen hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {open ? "Hide details" : "Details"}
            <IconChevronRight
              size={15}
              className={cn(
                "rotate-90 transition-transform duration-300",
                open && "-rotate-90",
              )}
            />
          </button>
        </div>

        <div
          id={contentId}
          aria-hidden={!open}
          className={cn(
            "grid border-t border-mist/70 transition-[grid-template-rows] duration-300",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div inert={!open} className="min-h-0 overflow-hidden">
            <div className="space-y-4 px-4 py-4 sm:px-5">
              <p className="text-small leading-relaxed text-charcoal">
                {quest.invitation}
              </p>

              {state === "active" && checklist.length > 0 && (
                <ul className="space-y-2">
                  {checklist.map((item) => {
                    const done = entry?.stepsDone.includes(item.key) ?? false;
                    const isNext =
                      !done &&
                      checklist.find(
                        (candidate) =>
                          !entry?.stepsDone.includes(candidate.key),
                      )?.key === item.key;
                    return (
                      <li key={item.key}>
                        <button
                          ref={isNext ? nextStepRef : undefined}
                          type="button"
                          role="checkbox"
                          aria-checked={done}
                          onClick={() =>
                            markQuestStep(quest.slug, item.key, !done)
                          }
                          className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-button)] px-2 py-2 text-left transition-colors hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] ring-1",
                              done
                                ? "bg-accent text-[#fdfbf3] ring-accent"
                                : "bg-paper ring-mist",
                            )}
                          >
                            {done && <IconCheck size={13} />}
                          </span>
                          <span
                            className={cn(
                              "text-small",
                              done
                                ? "text-ash line-through decoration-mist"
                                : "text-charcoal",
                            )}
                          >
                            {item.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {latestReflection && state === "completed" ? (
                <blockquote className="rounded-[var(--radius-button)] bg-linen px-4 py-3 text-small leading-relaxed text-charcoal">
                  {latestReflection.body || "No words saved — only a feeling."}
                </blockquote>
              ) : (
                <blockquote className="rounded-[var(--radius-button)] bg-linen px-4 py-3">
                  {quest.scriptureText && (
                    <p className="text-small leading-relaxed text-charcoal">
                      “{cleanVerseText(quest.scriptureText)}”
                    </p>
                  )}
                  <cite className="mt-2 block text-caption not-italic text-ash">
                    {quest.scriptureReference}
                  </cite>
                </blockquote>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/app/quests/${quest.slug}`}
                  className="inline-flex min-h-11 items-center text-small text-accent underline-offset-4 hover:underline"
                >
                  View full quest
                </Link>
                {state === "completed" && (
                  <GentleLink variant="text" size="sm" href="/app/journey">
                    See in Journey
                  </GentleLink>
                )}
                {state === "ready" && (
                  <button
                    type="button"
                    onClick={() => {
                      unpickQuest(quest.slug, isPlus);
                      toast("Quest removed from Ready.");
                    }}
                    className="inline-flex min-h-11 items-center text-small text-ash transition-colors hover:text-charcoal"
                  >
                    Remove from Ready
                  </button>
                )}
                {state === "active" && expired && (
                  <button
                    type="button"
                    onClick={() => {
                      removeQuest(quest.slug, isPlus);
                      toast("Quest removed.");
                    }}
                    className="inline-flex min-h-11 items-center text-small text-ash transition-colors hover:text-charcoal"
                  >
                    Remove quest
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </PaperCard>
    </motion.li>
  );
}
