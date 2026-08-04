import { motion } from "framer-motion";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { IconCheck } from "@/components/design-system/icons";
import { SEVEN_DAYS_TILES } from "@/lib/games/seven-days/tiles";
import type { SevenDaysTileId } from "@/lib/games/seven-days/types";
import { cn } from "@/lib/utils/cn";

/** One goal, as a chip in the HUD or a row in the level card. */
export function SevenDaysGoalChip({
  tile,
  have,
  need,
  met,
  variant = "chip",
}: {
  tile: SevenDaysTileId;
  have: number;
  need: number;
  met: boolean;
  variant?: "chip" | "row";
}) {
  const art = SEVEN_DAYS_TILES[tile];
  const label = `${art.label}: ${have} of ${need} gathered`;

  if (variant === "row") {
    return (
      <li
        className={cn(
          "flex items-center gap-3 rounded-[var(--radius-button)] border px-3 py-2.5",
          met
            ? "border-accent/45 bg-accent-surface"
            : "border-mist bg-linen/70",
        )}
      >
        <span
          className={cn(
            // Sized to the sprite it holds. The colour here is tile identity — how
            // you tell Light from Waters at a glance — so the chip stays; it just
            // stopped clipping a 48px sprite into 36px.
            "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[12px] ring-1",
            art.chipClassName,
          )}
        >
          <ArtIcon
            name={art.sprite}
            size={56}
            // Keep every goal symbol centred even when its weighted art box
            // is larger than the chip that contains it.
            className="absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 object-center"
          />
        </span>
        <span className="min-w-0 flex-1 text-small text-charcoal">
          Gather {need} {art.label}
        </span>
        {met && <IconCheck size={17} className="shrink-0 text-accent" />}
      </li>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      aria-label={label}
    >
      <motion.span
        aria-hidden="true"
        // A goal that fills is the one thing on the HUD worth noticing, so it
        // gets a beat of its own rather than silently changing a number.
        animate={met ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={cn(
          "relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-[8px] ring-1",
          art.chipClassName,
          met && "ring-2 ring-accent",
        )}
      >
        <ArtIcon
          name={art.sprite}
          size={44}
          // The compact HUD uses the same geometric centre as the board.
          className="absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 object-center"
        />
      </motion.span>
      <motion.span
        key={have}
        aria-hidden="true"
        initial={{ y: -3, opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.18 }}
        className={cn(
          "text-small font-medium",
          met ? "text-accent" : "text-graphite",
        )}
      >
        {met ? <IconCheck size={15} /> : `${have}/${need}`}
      </motion.span>
    </span>
  );
}
