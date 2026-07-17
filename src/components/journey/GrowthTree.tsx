"use client";

/**
 * GrowthTree — the living emotional center of the journey.
 *
 * The tree grows through six stages and never decays. Prayer feeds roots,
 * Scripture the branches, kindness the leaves, service the fruit, reflection
 * the light, gratitude the flowers. It is an illustration, not a chart.
 *
 * Drawn in the app's own pixel language: each stage is a deterministic 32x32
 * transparent sprite from the pixel-asset registry,
 * scaled in whole cells so every pixel stays crisp (the box snaps to the
 * nearest cell multiple of `size` and then holds still, so surrounding
 * layout never shifts). Around the sprite the scene stays quiet — a
 * candlelight glow once reflection has brought sunlight, a soft ground
 * shadow, and a few flowers and fruit resting at the base. A stage change
 * breathes in on a gentle spring — never a pop — and all motion honors
 * stillness (the OS reduced-motion query OR the in-app setting).
 */
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";
import type { GrowthTreeState, TreeStage } from "@/lib/questos/types";
import { useQuestOS } from "@/lib/questos/store";

/** Each stage maps to its hand-drawn sprite in the pixel registry. */
const STAGE_SPRITE: Record<TreeStage, PixelSpriteName> = {
  seed: "tree-stage-0",
  sprout: "tree-stage-1",
  young: "tree-stage-2",
  growing: "tree-stage-3",
  "fruit-bearing": "tree-stage-4",
  sheltering: "tree-stage-5",
};

/** All tree-stage sprites share one true 32x32 logical grid. */
const GRID = 32;

interface GrowthTreeProps {
  state: GrowthTreeState;
  size?: number;
  className?: string;
  showGround?: boolean;
}

export function GrowthTree({
  state,
  size = 220,
  className,
  showGround = true,
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
      {state.byType.sunlight > 0 && (
        <div
          aria-hidden="true"
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
      {showGround && (
        <div
          aria-hidden="true"
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
        initial={still ? false : { scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={still ? { duration: 0 } : grow}
      >
        <PixelIcon name={STAGE_SPRITE[state.stage]} size={cell} animate />
      </motion.div>

      {/* Flowers — gratitude, gathered left of the trunk. Each blooms once in
          its own slot; the ones already there never move. */}
      {flowerCount > 0 && (
        <div
          className="pointer-events-none absolute flex flex-row-reverse items-end"
          style={{ bottom: cell * 3, right: "50%", marginRight: cell * 3, gap: cell }}
        >
          {Array.from({ length: flowerCount }, (_, i) => (
            <motion.span
              key={`flower-${i}`}
              className="origin-bottom"
              initial={still ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={still ? { duration: 0 } : grow}
            >
              <PixelIcon name="flower" size={mini} />
            </motion.span>
          ))}
        </div>
      )}

      {/* Fruit — service, set down right of the trunk. */}
      {fruitCount > 0 && (
        <div
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
