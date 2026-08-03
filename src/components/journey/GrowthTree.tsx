"use client";

/**
 * GrowthTree — the living emotional center of the journey.
 *
 * The tree grows through twenty stages and never decays. Prayer feeds roots,
 * Scripture the branches, kindness the leaves, service the fruit, reflection
 * the light, gratitude the flowers. It is an illustration, not a chart.
 *
 * Drawn in the app's hand-painted 2.5D language: each stage is a reviewed,
 * source-anchored transparent illustration on the registry's shared canvas.
 * Around the artwork the scene stays quiet — a
 * candlelight glow once reflection has brought sunlight, a soft ground
 * shadow, and a few flowers rooted around the base. A stage change
 * breathes in on a gentle spring — never a pop — and all motion honors
 * stillness (the OS reduced-motion query OR the in-app setting).
 */
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { ArtIcon, type ArtSpriteName } from "@/components/design-system/ArtIcon";
import type { GrowthTreeState, TreeStage } from "@/lib/questos/types";
import { useQuestOS } from "@/lib/questos/store";
import { TREE_STAGE_DEFINITIONS } from "@/lib/questos/growth-engine";

/** Resolve the domain stage to its same-position sprite in the registry. */
function stageSprite(stage: TreeStage): ArtSpriteName {
  const index = TREE_STAGE_DEFINITIONS.findIndex((entry) => entry.stage === stage);
  return `tree-stage-${Math.max(0, index)}` as ArtSpriteName;
}

/** A relative layout grid keeps surrounding accents proportional to the tree. */
const LAYOUT_UNITS = 32;

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

  // Smooth illustration scaling preserves the painted modeling at any size.
  const box = Math.max(64, Math.round(size));
  const unit = box / LAYOUT_UNITS;
  const flowerSize = Math.max(12, Math.round(box / 5));

  // A few quiet decorations resting at the base — gratitude to the left of
  // the trunk, service to the right. Capped so the ground never gets busy.
  const flowerCount = Math.min(3, state.byType.flowers);

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
            top: unit * 2,
            width: unit * 22,
            height: unit * 18,
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
            style={{ width: unit * 26, height: Math.max(3, unit * 0.6) }}
          />
        </div>
      )}

      {/* The tree itself changes with a quiet opacity settle, never a pop. */}
      <motion.div
        key={state.stage}
        className="relative origin-bottom"
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={still ? { duration: 0 } : grow}
      >
        <ArtIcon name={stageSprite(state.stage)} size={box} />
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
              bottom: unit * slot.bottomCells,
            }}
            initial={still ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: slot.scale, opacity: 1 }}
            transition={still ? { duration: 0 } : grow}
          >
            <ArtIcon name="flower" size={flowerSize} />
          </motion.span>
        );
      })}
    </div>
  );
}
