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
 * One titled group of quests.
 *
 * The catalogue below the board always passes `list`. Rails were tried there
 * and made it worse: a rail slot stretches every card to the tallest in the
 * set, so a one-line quest wore three lines of empty box, and seventeen
 * category shelves turned a page into a maze. The switch now belongs to the
 * board's own Active / Ready / Completed groups, where the cards are tall and
 * few and a rail genuinely saves a screen.
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

      <QuestLane layout={layout} className="mt-2">
        {children}
      </QuestLane>
    </section>
  );
}

/**
 * The rail-or-column body on its own, without a section heading.
 *
 * Split out so the quest board's own Active / Ready / Completed groups can be
 * railed by the same switch that used to govern the catalogue below them —
 * which was never what the switch was for. `as` keeps the board's lists real
 * `<ul>`s rather than turning every card into an orphaned `<li>`.
 */
export function QuestLane({
  layout,
  children,
  className,
  as: Tag = "div",
  ...rest
}: {
  layout: QuestLayout;
  children: React.ReactNode;
  className?: string;
  as?: "div" | "ul";
} & React.HTMLAttributes<HTMLElement>) {
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

  // Depend on how many cards there are, not on the children themselves. A
  // React element array is a fresh object every render, so listing `children`
  // tore down and rebuilt a ResizeObserver on every single render of every
  // rail on the page.
  const childCount = Array.isArray(children) ? children.length : 1;
  useEffect(() => {
    if (layout !== "rail") return;
    updateEdges();
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [layout, childCount]);

  function scrollRail(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.85,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  /**
   * One card's slot.
   *
   * When the lane is a `<ul>` the slot has to be the `<li>`, and the lane has
   * to place it directly. A rail slot used to be a `<div>`, which put a plain
   * div between the list and its items — so the list announced no items at all
   * and every card lost its "2 of 3". Owning the item here rather than asking
   * each card to be one keeps both layouts right for the same children.
   */
  const Slot = Tag === "ul" ? "li" : "div";
  const slots = (extra?: string) => {
    const wrap = (child: React.ReactNode, key: React.Key) => (
      <Slot key={key} className={cn(Tag === "ul" && "list-none", extra)}>
        {child}
      </Slot>
    );
    return Array.isArray(children)
      ? children.map((child, index) => wrap(child, index))
      : wrap(children, 0);
  };

  if (layout === "list") {
    return (
      <Tag className={cn("grid gap-3", className)} {...rest}>
        {Tag === "ul" ? slots() : children}
      </Tag>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <Tag
        ref={railRef as React.Ref<never>}
        onScroll={updateEdges}
        className="-mx-1 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        {...rest}
      >
        {/* Each child owns one rail slot so the cards read as one set. */}
        {slots(RAIL_ITEM)}
      </Tag>

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
            // 44px, like every other control. A segment inside a pill still
            // has to be reachable by a thumb.
            "min-h-11 rounded-full px-3.5 text-caption font-medium transition-colors duration-300",
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
