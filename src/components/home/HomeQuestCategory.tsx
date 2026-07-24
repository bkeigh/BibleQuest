"use client";

/**
 * One nested Home quest drawer. Category headers stay visible while quest
 * cards collapse independently, keeping Home compact without hiding status.
 */
import { useCallback, useId, useRef, useState } from "react";
import type { HomeQuestItem } from "@/lib/questos/home-quest-groups";
import { QuestAccordionCard } from "@/components/quests/QuestAccordionCard";
import { QuestSlip } from "@/components/quests/QuestSlip";
import { IconChevronRight } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";

interface HomeQuestCategoryProps {
  label: string;
  items: HomeQuestItem[];
  defaultOpen?: boolean;
  emptyBody: string;
  children?: React.ReactNode;
}

export function HomeQuestCategory({
  label,
  items,
  defaultOpen = false,
  emptyBody,
  children,
}: HomeQuestCategoryProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Card lifecycle actions may move the card to another category. Return
  // keyboard focus to the stable category trigger after React commits.
  const restoreFocus = useCallback(() => {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  return (
    <section className="app-glass-surface app-glass-surface-quiet rounded-[var(--radius-card)] bg-linen">
      <h3>
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
          className="group flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-card)] px-4 py-3 text-left transition-colors duration-300 hover:bg-paper/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-linen/70 sm:px-5"
        >
          <span className="min-w-0 flex-1 font-display text-[1.125rem] text-graphite">
            {label}
          </span>
          <span className="rounded-full bg-accent-surface px-2 py-0.5 text-[0.8125rem] font-medium text-accent">
            {items.length}
          </span>
          <IconChevronRight
            aria-hidden="true"
            className={cn(
              "shrink-0 rotate-90 text-ash transition-transform duration-300 [transition-timing-function:var(--ease-gentle)]",
              open && "-rotate-90",
            )}
          />
        </button>
      </h3>

      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 [transition-timing-function:var(--ease-gentle)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div inert={!open} className="min-h-0 overflow-hidden">
          <div className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
            {items.length > 0 ? (
              <ul aria-label={label} className="space-y-3">
                {items.map((item) =>
                  item.kind === "assignment" ? (
                    <li
                      key={`assignment:${item.assignment.pickedAt}:${item.quest.slug}`}
                    >
                      <QuestSlip
                        quest={item.quest}
                        href={`/app/quests/${item.quest.slug}`}
                        assignmentStatus={item.assignment.status}
                        completed={item.assignment.status === "completed"}
                        expiresAt={item.assignment.expiresAt}
                      />
                    </li>
                  ) : (
                    <QuestAccordionCard
                      key={`shelf:${item.quest.slug}`}
                      quest={item.quest}
                      entry={item.entry}
                      open={expandedSlug === item.quest.slug}
                      onOpenChange={(nextOpen) =>
                        setExpandedSlug(nextOpen ? item.quest.slug : null)
                      }
                      onRelocate={restoreFocus}
                    />
                  ),
                )}
              </ul>
            ) : (
              <p className="px-1 text-small text-ash">{emptyBody}</p>
            )}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
