"use client";

/**
 * The library heading, and the only persistent control on the Quests page.
 *
 * The Filters disclosure used to sit at y≈525 and scroll away for good: six
 * thousand pixels into a hundred and fifty quests there was no way to change
 * duration or category without scrolling back to find it. Sticking the heading
 * keeps that one tap reachable from anywhere in the list.
 *
 * Only the heading line sticks. The panel is a non-sticky sibling, so an open
 * filter panel does not ride hundreds of pixels of chrome down the page.
 *
 * `Chip` and `FilterGroup` live here rather than in a fourth file because
 * QuestBrowse already imports this component; putting them anywhere else would
 * either duplicate them or create a cycle.
 */
import { useId, useRef } from "react";
import { useStrings } from "@/lib/i18n";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils/cn";
import { IconSliders } from "@/components/design-system/icons";

export function QuestCatalogueBar({
  title,
  count,
  open,
  onOpenChange,
  activeFilterCount,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeFilterCount: number;
  children: React.ReactNode;
}) {
  const t = useStrings();
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useShouldReduceMotion();

  function togglePanel(next: boolean) {
    onOpenChange(next);
    // Opening from deep in the list would put the panel above the viewport.
    // Reaching for Filters means "take me back to the top of the library".
    if (next) {
      wrapperRef.current?.scrollIntoView({
        block: "start",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="scroll-mt-[calc(env(safe-area-inset-top)+0.5rem)]"
    >
      {/* Sticky recipe and the -mx/px bleed match ChapterReader and
          PageContainer's px-5 sm:px-8 exactly. backdrop-blur-md is 12px, well
          inside the ceiling tests/glass-scroll-cost.test.ts enforces. */}
      <div className="sticky top-[env(safe-area-inset-top)] z-20 -mx-5 border-b border-mist/70 bg-parchment/92 px-5 pt-3 pb-2 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="flex items-end justify-between gap-3">
          {/* Matches the shelf labels: quiet small caps, so the sticky strip
              stays a thin rule over the list rather than a second title bar
              riding down the page. */}
          <h2 className="font-art-label text-[0.9375rem] leading-tight uppercase tracking-[0.1em] text-gilt">
            {title}
            <span className="ms-2 font-sans text-caption normal-case tracking-normal text-ash">
              {count}
            </span>
          </h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => togglePanel(!open)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] px-2 text-small text-accent transition-colors hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconSliders size={15} />
            {t.quests.filters}
            {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
          </button>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {count} {count === 1 ? "quest" : "quests"} in view
        </p>
      </div>

      <div
        id={panelId}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 [transition-timing-function:var(--ease-gentle)]",
          open ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[minmax(0,0fr)]",
        )}
      >
        <div inert={!open} className="min-h-0 overflow-hidden">
          <div className="space-y-4 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-caption font-medium text-ash">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  small,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
  /** A filter that would return nothing. Dimmed rather than hidden, so the
      shape of the collection stays visible while it is unreachable. */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-11 min-w-11 shrink-0 whitespace-nowrap rounded-full border transition-all duration-300",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        small ? "px-3 py-1.5 text-[0.8125rem]" : "px-4 py-2 text-[0.875rem]",
        disabled && "cursor-not-allowed opacity-40",
        active
          ? "border-accent bg-accent-surface text-accent-ink"
          : "border-mist bg-paper text-ash",
        !disabled &&
          !active &&
          "hover:border-accent/40 hover:text-charcoal"
      )}
    >
      {children}
    </button>
  );
}
