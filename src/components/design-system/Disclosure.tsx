"use client";

/**
 * Disclosure — the app's collapsible primitive (filters, long lists, FAQ,
 * settings groups).
 *
 * - Real <button> trigger with aria-expanded / aria-controls.
 * - Content animates via the CSS grid-template-rows 0fr→1fr technique — no
 *   JS measuring — so both reduced-motion kill-switches (OS media query and
 *   html.force-reduce-motion) flatten it automatically.
 * - Works controlled (`open` + `onOpenChange`) or uncontrolled (`defaultOpen`).
 */
import { useCallback, useId, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { IconChevronRight } from "./icons";

type DisclosureVariant = "plain" | "card" | "quiet";

const VARIANTS: Record<
  DisclosureVariant,
  { root: string; trigger: string; content: string }
> = {
  /** Borderless — for inline groups and quiet lists. */
  plain: {
    root: "",
    trigger: "py-2",
    content: "pb-2",
  },
  /** PaperCard-like surface. */
  card: {
    root: "app-glass-surface rounded-[var(--radius-card)] border border-mist bg-paper paper-shadow",
    trigger: "px-5 py-3.5",
    content: "px-5 pb-4",
  },
  /** Soft linen panel. */
  quiet: {
    root: "app-glass-surface app-glass-surface-quiet rounded-[var(--radius-card)] bg-linen",
    trigger: "px-5 py-3.5",
    content: "px-5 pb-4",
  },
};

interface DisclosureProps {
  /** Trigger label (left side of the button). */
  label: React.ReactNode;
  /** Collapsible content. */
  children: React.ReactNode;
  /** Controlled open state. Leave undefined to let Disclosure manage it. */
  open?: boolean;
  /** Initial state when uncontrolled. */
  defaultOpen?: boolean;
  /** Called with the next state on every toggle (controlled or not). */
  onOpenChange?: (open: boolean) => void;
  variant?: DisclosureVariant;
  /**
   * Optional slot rendered on the right of the trigger, before the chevron
   * (e.g. an active-filter summary). Takes precedence over `count`.
   */
  summary?: React.ReactNode;
  /** Convenience count chip (e.g. number of active filters). */
  count?: number;
  className?: string;
  /** Extra classes for the content wrapper inside the collapse region. */
  contentClassName?: string;
}

export function Disclosure({
  label,
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  variant = "plain",
  summary,
  count,
  className,
  contentClassName,
}: DisclosureProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;

  const handleToggle = useCallback(() => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }, [open, isControlled, onOpenChange]);

  const styles = VARIANTS[variant];

  const rightSlot =
    summary ??
    (typeof count === "number" ? (
      <span className="rounded-full bg-accent-surface px-2 py-0.5 text-[0.8125rem] font-medium text-accent">
        {count}
      </span>
    ) : null);

  return (
    <div className={cn(styles.root, className)}>
      <button
        type="button"
        id={triggerId}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={handleToggle}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 text-left font-medium text-graphite",
          "rounded-[var(--radius-button)]",
          "transition-colors hover:bg-paper/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-linen/70",
          styles.trigger
        )}
      >
        <span className="min-w-0 flex-1">{label}</span>
        {rightSlot && <span className="shrink-0">{rightSlot}</span>}
        <IconChevronRight
          className={cn(
            "shrink-0 rotate-90 text-ash transition-transform duration-300 [transition-timing-function:var(--ease-gentle)]",
            open && "-rotate-90"
          )}
        />
      </button>
      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 [transition-timing-function:var(--ease-gentle)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div inert={!open} className="min-h-0 overflow-hidden">
          <div className={cn(styles.content, contentClassName)}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * DisclosureGroup — consistent vertical rhythm for a stack of Disclosures.
 * Purely presentational; every item stays independently openable.
 */
export function DisclosureGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}
