"use client";

import { PixelIcon } from "@/components/design-system/PixelIcon";
import {
  BOOSTS,
  BOOST_IDS,
  type BoostId,
  type BoostInventory,
} from "@/lib/games/arcade/boosts";
import { cn } from "@/lib/utils/cn";

/**
 * The helps a reader is holding, under the board.
 *
 * Only ever shortcuts. Every level is finishable with none of them, running
 * out of moves already costs nothing but another go, and there is nothing here
 * that touches a question or an explanation.
 *
 * A reader holding nothing gets one line saying where helps come from, not
 * three dead buttons — most readers arrive here with an empty satchel and the
 * empty grid would be the largest thing under the board. Once they hold any
 * help, every help is shown, including the ones at zero, so the bar keeps its
 * shape as they spend.
 */
export function SevenDaysBoostBar({
  inventory,
  disabled,
  onUse,
}: {
  inventory: BoostInventory;
  disabled: boolean;
  onUse: (id: BoostId) => void;
}) {
  if (BOOST_IDS.every((id) => inventory[id] === 0)) {
    return (
      <p className="text-center text-caption leading-relaxed text-ash">
        Answer a day&apos;s questions well and you will earn board helps —
        more moves, a place to look, a whole kind gathered at once.
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-label="Board helps"
      className="grid grid-cols-3 gap-2"
    >
      {BOOST_IDS.map((id) => {
        const boost = BOOSTS[id];
        const count = inventory[id];
        const usable = count > 0 && !disabled;
        return (
          <button
            key={id}
            type="button"
            disabled={!usable}
            onClick={() => onUse(id)}
            aria-label={`${boost.name}. ${
              count > 0 ? `${count} left.` : "None left."
            } ${boost.description}`}
            className={cn(
              "app-glass-surface flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-button)] border px-2 py-2 transition-colors duration-300",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              usable
                ? "border-mist bg-paper text-charcoal hover:border-accent/45"
                : "border-mist/60 bg-linen/50 text-quill",
            )}
          >
            <span aria-hidden="true" className={cn(!usable && "opacity-45")}>
              <PixelIcon name={boost.sprite} size={32} />
            </span>
            <span aria-hidden="true" className="text-caption font-medium">
              {count > 0 ? count : "none"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
