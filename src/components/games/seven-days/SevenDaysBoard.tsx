"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { colOf, rowOf } from "@/lib/games/seven-days/board";
import { SEVEN_DAYS_TILES } from "@/lib/games/seven-days/tiles";
import {
  BLOCKED,
  type SevenDaysBoard as Board,
} from "@/lib/games/seven-days/types";
import { cn } from "@/lib/utils/cn";

/** Travel that reads as a deliberate flick toward a neighbour, not a scroll. */
const SWIPE_THRESHOLD = 18;

interface SevenDaysBoardProps {
  board: Board;
  selected: number | null;
  disabled: boolean;
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
  onSelect,
  onSwap,
}: SevenDaysBoardProps) {
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const swipeOrigin = useRef<{ index: number; x: number; y: number } | null>(
    null,
  );

  function focusCell(index: number) {
    const bounded = Math.min(board.cells.length - 1, Math.max(0, index));
    cellRefs.current[bounded]?.focus();
  }

  function activate(index: number) {
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

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, index: number) {
    swipeOrigin.current = { index, x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const origin = swipeOrigin.current;
    swipeOrigin.current = null;
    if (!origin || disabled) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    const row = rowOf(board, origin.index);
    const col = colOf(board, origin.index);
    let target: number | null = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0 && col + 1 < board.cols) target = origin.index + 1;
      if (dx < 0 && col > 0) target = origin.index - 1;
    } else {
      if (dy > 0 && row + 1 < board.rows) target = origin.index + board.cols;
      if (dy < 0 && row > 0) target = origin.index - board.cols;
    }
    if (target !== null) onSwap(origin.index, target);
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
        const row = rowOf(board, index) + 1;
        const col = colOf(board, index) + 1;
        return (
          <button
            key={index}
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
            onPointerUp={onPointerUp}
            className={cn(
              "relative flex aspect-square items-center justify-center rounded-[11px] ring-1 transition-transform duration-200 [transition-timing-function:var(--ease-gentle)]",
              art.chipClassName,
              isSelected
                ? "scale-[1.06] ring-2 ring-accent"
                : "hover:scale-[1.03]",
              disabled && "pointer-events-none opacity-70",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            )}
          >
            <PixelIcon name={art.sprite} size={3} />
          </button>
        );
      })}
    </div>
  );
}
