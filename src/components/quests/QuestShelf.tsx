"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconArrowRight } from "@/components/design-system/icons";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils/cn";

export type QuestLayout = "rail" | "list";

/** A card wide enough to read at a glance, narrow enough to promise another. */
const RAIL_ITEM =
  "grid w-[82%] shrink-0 snap-start [&>*]:h-full sm:w-[22rem]";
const EDGE_TOLERANCE = 24;

/**
 * One group of quests, as a side-scrolling rail or a plain column.
 *
 * The whole page used to be one long column: every shelf and every category
 * stacked, so finding the third kind of quest meant scrolling past everything
 * before it. A rail lets a group take one screen's width instead of ten
 * screens' height, and keeps the *number* of groups visible — which is the
 * thing the column hid.
 *
 * The column is still here because a rail is worse for some people and some
 * tasks: comparing options, using a screen reader with a braille display, or
 * simply wanting the whole list. Both render the same cards in the same order,
 * so nothing is only reachable one way.
 */
export function QuestShelf({
  title,
  count,
  layout,
  children,
  action,
}: {
  title: React.ReactNode;
  count?: number;
  layout: QuestLayout;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useShouldReduceMotion();
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  function updateEdges() {
    const rail = railRef.current;
    if (!rail) return;
    const atStart = rail.scrollLeft <= EDGE_TOLERANCE;
    const atEnd =
      rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - EDGE_TOLERANCE;
    setEdges((current) =>
      current.atStart === atStart && current.atEnd === atEnd
        ? current
        : { atStart, atEnd },
    );
  }

  // A rail that fits its content needs no arrows; one that grows past the
  // viewport does. Both are decided by measurement, not by counting cards.
  useEffect(() => {
    if (layout !== "rail") return;
    updateEdges();
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [layout, children]);

  function scrollRail(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.85,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  return (
    <section className="mt-6" aria-label={typeof title === "string" ? title : undefined}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent">
          {title}
          {count !== undefined && (
            <span className="ms-2 font-sans text-caption normal-case tracking-normal text-ash">
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>

      {layout === "list" ? (
        <div className="mt-2 space-y-3">{children}</div>
      ) : (
        <div className="relative mt-2">
          <div
            ref={railRef}
            onScroll={updateEdges}
            className="-mx-1 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* Each child owns one rail slot so the cards read as one set. */}
            {Array.isArray(children)
              ? children.map((child, index) => (
                  <div key={index} className={RAIL_ITEM}>
                    {child}
                  </div>
                ))
              : <div className={RAIL_ITEM}>{children}</div>}
          </div>

          {!(edges.atStart && edges.atEnd) && (
            <>
              <RailArrow
                direction="previous"
                disabled={edges.atStart}
                onClick={() => scrollRail(-1)}
              />
              <RailArrow
                direction="next"
                disabled={edges.atEnd}
                onClick={() => scrollRail(1)}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function RailArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const next = direction === "next";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={next ? "Next quests" : "Previous quests"}
      className={cn(
        "absolute top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full",
        "border border-white/35 bg-paper/90 text-accent paper-shadow backdrop-blur-md transition-opacity",
        "disabled:pointer-events-none disabled:opacity-0",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex",
        next ? "-right-5 sm:-right-8" : "-left-5 sm:-left-8",
      )}
    >
      {next ? <IconArrowRight size={17} /> : <IconArrowLeft size={17} />}
    </button>
  );
}

/** The rail/column switch. Starts on the rail; the choice is remembered. */
export function QuestLayoutToggle({
  layout,
  onChange,
}: {
  layout: QuestLayout;
  onChange: (layout: QuestLayout) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Quest layout"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-mist bg-linen/70 p-0.5"
    >
      {(["rail", "list"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={layout === option}
          onClick={() => onChange(option)}
          className={cn(
            "min-h-9 rounded-full px-3 text-caption font-medium transition-colors duration-300",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            layout === option
              ? "bg-paper text-accent paper-shadow"
              : "text-ash hover:text-charcoal",
          )}
        >
          {option === "rail" ? "Rows" : "List"}
        </button>
      ))}
    </div>
  );
}

const LAYOUT_KEY = "biblequest:quest-layout";

/**
 * Remembers the rail/column choice on the device. Not in QuestOS: this is a
 * view preference, not part of anyone's journey, and it should not sync or
 * travel with an export.
 */
export function readQuestLayout(): QuestLayout {
  if (typeof window === "undefined") return "rail";
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "rail";
  } catch {
    return "rail";
  }
}

export function writeQuestLayout(layout: QuestLayout): void {
  try {
    window.localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // A device that will not remember still switches for this visit.
  }
}
