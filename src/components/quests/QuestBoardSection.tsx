"use client";

/**
 * Collapsible Quest-board state group. The board controls open state so Active
 * can receive a newly begun card without leaving the user's current context.
 */
import { useId } from "react";
import { motion } from "framer-motion";
import { IconChevronRight } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";

interface QuestBoardSectionProps {
  label: string;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emptyBody: string;
  children: React.ReactNode;
}

export function QuestBoardSection({
  label,
  count,
  open,
  onOpenChange,
  emptyBody,
  children,
}: QuestBoardSectionProps) {
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;

  return (
    <section className="app-glass-surface app-glass-surface-quiet rounded-[var(--radius-card)] bg-linen">
      <h3>
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => onOpenChange(!open)}
          className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-card)] px-4 py-3 text-left transition-colors hover:bg-paper/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-5"
        >
          <span className="min-w-0 flex-1 font-display text-[1.25rem] text-graphite">
            {label}
          </span>
          <motion.span
            key={count}
            initial={{ scale: 0.9, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-full bg-accent-surface px-2 py-0.5 text-[0.8125rem] font-medium text-accent"
          >
            {count}
          </motion.span>
          <IconChevronRight
            aria-hidden="true"
            className={cn(
              "shrink-0 rotate-90 text-ash transition-transform duration-300",
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
          "grid transition-[grid-template-rows] duration-300",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div inert={!open} className="min-h-0 overflow-hidden">
          <div className="px-3 pb-3 sm:px-4 sm:pb-4">
            {count > 0 ? (
              children
            ) : (
              <p className="px-1 py-2 text-small text-ash">{emptyBody}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
