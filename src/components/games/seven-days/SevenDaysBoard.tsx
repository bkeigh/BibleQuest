"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion } from "framer-motion";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { colOf, rowOf } from "@/lib/games/seven-days/board";
import { SEVEN_DAYS_TILES } from "@/lib/games/seven-days/tiles";
import {
  BLOCKED,
  type SevenDaysBoard as Board,
} from "@/lib/games/seven-days/types";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils/cn";

/** Travel that reads as a deliberate flick toward a neighbour, not a scroll. */
const SWIPE_THRESHOLD = 18;

/** How far a tile leans after the finger before the trade resolves. */
const DRAG_LEAN = 14;

interface SevenDaysBoardProps {
  board: Board;
  selected: number | null;
  disabled: boolean;
  /** Cells about to leave, so they can be seen going rather than just gone. */
  clearing?: ReadonlySet<number>;
  /** A trade the hint boost is pointing at. */
  hinted?: { from: number; to: number } | null;
  onSelect: (index: number) => void;
  onSwap: (from: number, to: number) => void;
}

/**
 * The board.
 *
 * Every cell is a real button. Tapping one and then a neighbour trades them,
 * which is the whole game — and it means the board is playable with a keyboard
 * or a screen reader, not only with a confident thumb. Swiping is an extra way
 * in for people who already know match-3, never the only way.
 */
export function SevenDaysBoard({
  board,
  selected,
  disabled,
  clearing,
  hinted,
  onSelect,
  onSwap,
}: SevenDaysBoardProps) {
  const reduceMotion = useShouldReduceMotion();
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const swipeOrigin = useRef<{ index: number; x: number; y: number } | null>(
    null,
  );
  /** Set by a completed swipe so the click it generates does not also count. */
  const swallowClick = useRef(false);
  /** The live lean of the tile under the finger, and who it is reaching for. */
  const [drag, setDrag] = useState<{
    index: number;
    toward: number | null;
    x: number;
    y: number;
  } | null>(null);

  function focusCell(index: number) {
    const bounded = Math.min(board.cells.length - 1, Math.max(0, index));
    cellRefs.current[bounded]?.focus();
  }

  function activate(index: number) {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    if (disabled) return;
    if (selected !== null && selected !== index) onSwap(selected, index);
    else onSelect(index);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const row = rowOf(board, index);
    const col = colOf(board, index);
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        if (col + 1 < board.cols) focusCell(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (col > 0) focusCell(index - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        if (row + 1 < board.rows) focusCell(index + board.cols);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (row > 0) focusCell(index - board.cols);
        break;
      case "Escape":
        if (selected !== null) {
          event.preventDefault();
          onSelect(selected);
        }
        break;
      default:
        break;
    }
  }

  /** The neighbour a drag of (dx, dy) from `index` is reaching for. */
  function neighbourToward(index: number, dx: number, dy: number) {
    const row = rowOf(board, index);
    const col = colOf(board, index);
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0 && col + 1 < board.cols) return index + 1;
      if (dx < 0 && col > 0) return index - 1;
    } else {
      if (dy > 0 && row + 1 < board.rows) return index + board.cols;
      if (dy < 0 && row > 0) return index - board.cols;
    }
    return null;
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (disabled) return;
    // Capture on the tile the drag started from. Without it the release lands
    // on whatever element is under the finger — often a different tile, often
    // nothing at all — so `pointerup` never reached the origin and the swipe
    // was simply dropped, leaving a stale origin behind to fire on the next
    // unrelated tap.
    event.currentTarget.setPointerCapture(event.pointerId);
    swipeOrigin.current = { index, x: event.clientX, y: event.clientY };
    setDrag(null);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const origin = swipeOrigin.current;
    if (!origin || disabled) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    const toward = neighbourToward(origin.index, dx, dy);
    // The tile leans after the finger along one axis only, capped at a little
    // under a cell so it reads as "these two would trade" rather than as a
    // tile being dragged loose from the board.
    const along = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const lean = Math.max(-DRAG_LEAN, Math.min(DRAG_LEAN, along));
    setDrag({
      index: origin.index,
      toward,
      x: Math.abs(dx) > Math.abs(dy) ? lean : 0,
      y: Math.abs(dx) > Math.abs(dy) ? 0 : lean,
    });
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const origin = swipeOrigin.current;
    swipeOrigin.current = null;
    setDrag(null);
    if (!origin || disabled) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    // A completed swipe is not also a tap. Without this the click that follows
    // the release ran `activate` too, so one flick both traded the tiles and
    // left the origin selected for the next tap to trade again.
    swallowClick.current = true;
    const target = neighbourToward(origin.index, dx, dy);
    if (target !== null) onSwap(origin.index, target);
  }

  function onPointerCancel() {
    swipeOrigin.current = null;
    setDrag(null);
  }

  return (
    // A group of buttons rather than an ARIA grid: a gridcell may not be
    // pressable, and every cell here is a toggle. Each button's own label
    // carries its row and column, so position is never lost.
    <div
      role="group"
      aria-label={`Match board, ${board.rows} by ${board.cols}`}
      className="app-glass-surface grid gap-1.5 rounded-[var(--radius-card-lg)] border border-mist bg-vellum/85 p-2 paper-shadow-lg sm:gap-2 sm:p-3"
      style={{ gridTemplateColumns: `repeat(${board.cols}, minmax(0, 1fr))` }}
    >
      {board.cells.map((cell, index) => {
        // A cut-away cell still occupies its grid slot, or the shape collapses.
        if (cell === BLOCKED) {
          return (
            <span
              key={index}
              aria-hidden="true"
              className="aspect-square rounded-[11px] bg-graphite/[0.045]"
            />
          );
        }
        if (!cell) return <span key={index} aria-hidden="true" />;
        const art = SEVEN_DAYS_TILES[cell];
        const isSelected = selected === index;
        const isClearing = clearing?.has(index) ?? false;
        const isHinted = hinted?.from === index || hinted?.to === index;
        const isDragging = drag?.index === index;
        const isReachedFor = drag?.toward === index;
        const row = rowOf(board, index) + 1;
        const col = colOf(board, index) + 1;
        return (
          <motion.button
            // Keyed by what is in the cell, not only where: a tile that
            // changes kind is a new tile and gets to arrive, while one that
            // simply stays put is left alone.
            key={`${index}:${cell}`}
            initial={reduceMotion ? false : { y: -18, opacity: 0, scale: 0.9 }}
            animate={
              isClearing
                ? { scale: reduceMotion ? 1 : 0.35, opacity: reduceMotion ? 1 : 0 }
                : {
                    // A tile leaning after the finger, or the neighbour it is
                    // reaching for leaning back to meet it.
                    x: isDragging ? drag.x : isReachedFor ? -drag.x * 0.5 : 0,
                    y: isDragging ? drag.y : isReachedFor ? -drag.y * 0.5 : 0,
                    opacity: 1,
                    scale: isSelected || isDragging
                      ? 1.06
                      : isHinted && !reduceMotion
                        ? [1, 1.09, 1]
                        : 1,
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : isClearing
                  ? { duration: 0.16, ease: "easeIn" }
                  : isDragging || isReachedFor
                    // Following a finger has to be immediate; a spring here
                    // makes the tile lag behind the touch and feel loose.
                    ? { type: "tween", duration: 0.06, ease: "linear" }
                    : { type: "spring", stiffness: 520, damping: 32 }
            }
            ref={(node) => {
              cellRefs.current[index] = node;
            }}
            type="button"
            aria-pressed={isSelected}
            aria-label={`${art.label}, row ${row}, column ${col}`}
            aria-disabled={disabled}
            tabIndex={index === (selected ?? 0) ? 0 : -1}
            onClick={() => activate(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onPointerDown={(event) => onPointerDown(event, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            // Without this the browser claims a vertical drag for scrolling
            // before any pointermove arrives, so on a touch screen the board
            // could only ever be played by tapping — the swipe every match-3
            // player reaches for first simply scrolled the page instead.
            style={{ touchAction: "none" }}
            className={cn(
              "relative flex aspect-square items-center justify-center rounded-[11px] ring-1",
              art.chipClassName,
              isDragging && "z-10",
              isSelected
                ? "ring-2 ring-accent"
                : isHinted
                  ? "ring-2 ring-gilt"
                  : "hover:brightness-105",
              disabled && "pointer-events-none opacity-70",
              "outline-none focus-visible:ring-2 focus-visible:ring-accent",
            )}
          >
            {/* The sprite is taken out of flow entirely.
                A board cell is a grid fraction — about 41px across on a phone —
                while the sprite asks for 56. Left in flow, the cell's height
                came from its content and its width from the column, so
                `aspect-square` was resolving against a box the sprite was
                still arguing with: square in Chromium, a tall rectangle
                wherever the engine sizes an aspect-ratio box from content
                first. Absolute positioning means the art can never contribute
                a dimension, so the cell is square because the grid says so and
                for no other reason. */}
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <ArtIcon
                name={art.sprite}
                size={56}
                className="max-h-full max-w-full"
              />
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
