"use client";

/**
 * GrowthTree — the living emotional center of the journey.
 *
 * The tree grows through twenty stages and never decays. Prayer feeds roots,
 * Scripture the branches, kindness the leaves, service the fruit, reflection
 * the light, gratitude the flowers. It is an illustration, not a chart.
 *
 * Drawn in the app's own pixel language: each stage is a reviewed,
 * source-anchored transparent sprite on the registry's shared 32x32 logical canvas,
 * scaled in whole cells so every pixel stays crisp (the box snaps to the
 * nearest cell multiple of `size` and then holds still, so surrounding
 * layout never shifts). Around the sprite the scene stays quiet — a
 * candlelight glow once reflection has brought sunlight, a soft ground
 * shadow, and a few flowers and fruit rooted around the base. A stage change
 * breathes in on a gentle spring — never a pop — and all motion honors
 * stillness (the OS reduced-motion query OR the in-app setting).
 */
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";
import type { GrowthTreeState, TreeStage } from "@/lib/questos/types";
import { useQuestOS } from "@/lib/questos/store";
import { TREE_STAGE_DEFINITIONS } from "@/lib/questos/growth-engine";

/** Resolve the domain stage to its same-position sprite in the registry. */
function stageSprite(stage: TreeStage): PixelSpriteName {
  const index = TREE_STAGE_DEFINITIONS.findIndex((entry) => entry.stage === stage);
  return `tree-stage-${Math.max(0, index)}` as PixelSpriteName;
}

/** All tree-stage sprites share one true 32x32 logical grid. */
const GRID = 32;

/** Grounded slots keep flowers natural and clear of the trunk. */
const FLOWER_SLOTS = [
  { left: "20%", bottomCells: 0.75, scale: 0.72 },
  { left: "31%", bottomCells: 0.25, scale: 0.58 },
  { left: "72%", bottomCells: 0.55, scale: 0.68 },
] as const;

interface GrowthTreeProps {
  state: GrowthTreeState;
  size?: number;
  className?: string;
  showGround?: boolean;
  /** Render only the stage sprite for compact previews such as Home. */
  treeOnly?: boolean;
}

export function GrowthTree({
  state,
  size = 220,
  className,
  showGround = true,
  treeOnly = false,
}: GrowthTreeProps) {
  // Stillness: honor both the OS query and the in-app "Reduce motion" setting.
  const osReduced = useReducedMotion();
  const appReduced = useQuestOS((s) => s.settings.appearance.reducedMotion);
  const still = Boolean(osReduced) || appReduced;
  const grow = { type: "spring", stiffness: 120, damping: 14, mass: 0.6 } as const;

  // Whole-cell scaling: the sprite's rendered width tracks `size`, snapped
  // to the nearest cell so rects land on device pixels instead of blurring.
  const cell = Math.max(2, Math.round(size / GRID));
  const box = cell * GRID;
  const mini = Math.max(1, Math.round(cell / 2));

  // A few quiet decorations resting at the base — gratitude to the left of
  // the trunk, service to the right. Capped so the ground never gets busy.
  const flowerCount = Math.min(3, state.byType.flowers);
  const fruitCount = Math.min(3, state.byType.fruit);

  return (
    <div
      className={cn("relative flex items-end justify-center", className)}
      style={{ width: box, height: box }}
      role="img"
      aria-label={`Your growth: ${state.stageLabel}`}
    >
      {/* Soft sunlight — grows with reflection. Candlelight, not a spotlight. */}
      {!treeOnly && state.byType.sunlight > 0 && (
        <div
          aria-hidden="true"
          data-growth-accent="sunlight"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full blur-lg"
          style={{
            top: cell * 2,
            width: cell * 22,
            height: cell * 18,
            background:
              "radial-gradient(closest-side, var(--color-gold-100), transparent 78%)",
            opacity: 0.6,
          }}
        />
      )}

      {/* Ground — the sprites carry their own soil, so this is just one soft
          shadow to seat the tree. Semantic surface so it stays subtle in
          Candle mode (raw olive-100 would glow near-white on a dark canvas). */}
      {!treeOnly && showGround && (
        <div
          aria-hidden="true"
          data-growth-accent="ground"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center"
        >
          <div
            className="rounded-full bg-olive-300/25"
            style={{ width: cell * 26, height: Math.max(3, Math.round(cell * 0.6)) }}
          />
        </div>
      )}

      {/* The tree itself — a stage change breathes in, never a reshuffle,
          never a pop. Ambient sway/twinkle lives in the sprite and is
          flattened by both reduced-motion kill-switches in CSS. */}
      <motion.div
        key={state.stage}
        className="relative origin-bottom"
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={still ? { duration: 0 } : grow}
      >
        <PixelIcon name={stageSprite(state.stage)} size={cell} animate />
      </motion.div>

      {/* Flowers — gratitude rooted around the tree instead of floating in a row. */}
      {!treeOnly && Array.from({ length: flowerCount }, (_, i) => {
        const slot = FLOWER_SLOTS[i];
        return (
          <motion.span
            key={`flower-${i}`}
            data-growth-accent="flower"
            className="pointer-events-none absolute origin-bottom"
            style={{
              left: slot.left,
              bottom: cell * slot.bottomCells,
            }}
            initial={still ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: slot.scale, opacity: 1 }}
            transition={still ? { duration: 0 } : grow}
          >
            <PixelIcon name="flower" size={mini} />
          </motion.span>
        );
      })}

      {/* Fruit — service, set down right of the trunk. */}
      {!treeOnly && fruitCount > 0 && (
        <div
          data-growth-accent="fruit"
          className="pointer-events-none absolute flex items-end"
          style={{ bottom: cell * 3, left: "50%", marginLeft: cell * 3, gap: cell }}
        >
          {Array.from({ length: fruitCount }, (_, i) => (
            <motion.span
              key={`fruit-${i}`}
              className="relative block"
              style={{
                width: mini * 3,
                height: mini * 3,
              }}
              initial={still ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.9 }}
              transition={still ? { duration: 0 } : grow}
            >
              <span
                className="absolute bg-evergreen-900"
                style={{ left: 0, top: mini, width: mini * 3, height: mini * 2 }}
              />
              <span
                className="absolute bg-gold-500"
                style={{ left: mini, top: mini, width: mini * 2, height: mini }}
              />
              <span
                className="absolute bg-olive-700"
                style={{ right: 0, top: 0, width: mini, height: mini }}
              />
            </motion.span>
          ))}
        </div>
      )}
    </div>
  );
}
