"use client";

/**
 * GrowthTree — the living emotional center of the journey.
 *
 * The tree grows through six stages and never decays. Prayer feeds roots,
 * Scripture the branches, kindness the leaves, service the fruit, reflection
 * the light, gratitude the flowers. It is an illustration, not a chart.
 *
 * Positions are deterministic PER element index (seeded on species + index),
 * so growth is stable and additive: a new leaf appears in its own slot and
 * never disturbs the ones already there. New elements gently grow in and a
 * stage change eases the canopy outward — never a reshuffle, never a pop. All
 * motion honors stillness (the OS reduced-motion query OR the in-app setting).
 */
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { GrowthTreeState, TreeStage } from "@/lib/questos/types";
import { hashString, seededRandom } from "@/lib/utils/dates";
import { useQuestOS } from "@/lib/questos/store";

const STAGE_INDEX: Record<TreeStage, number> = {
  seed: 0,
  sprout: 1,
  young: 2,
  growing: 3,
  "fruit-bearing": 4,
  sheltering: 5,
};

// Golden angle — an even, organic spread across the canopy disk.
const GOLDEN = 2.399963229728653;

/**
 * Deterministic canopy placement for element `i` of a species. Depends only on
 * (species, i) — never on the total count or stage — so a placed element is
 * frozen and adding elements only appends. The radius is a fixed fraction of
 * the (stage-growing) canopy radius, so points drift gently OUTWARD as the tree
 * matures rather than teleporting.
 */
function placeInCanopy(species: string, i: number, r: number, cy: number) {
  const rand = seededRandom(hashString(`${species}:${i}`));
  const frac = Math.sqrt((i + 0.5) / (i + 4));
  const angle = i * GOLDEN + (rand() - 0.5) * 0.6;
  const rr = frac * r * (0.85 + rand() * 0.15);
  return {
    x: 110 + Math.cos(angle) * rr + (rand() - 0.5) * 4,
    y: cy + Math.sin(angle) * rr * 0.9 + (rand() - 0.5) * 4,
  };
}

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
  const stage = STAGE_INDEX[state.stage];

  // Stillness: honor both the OS query and the in-app "Reduce motion" setting.
  const osReduced = useReducedMotion();
  const appReduced = useQuestOS((s) => s.settings.appearance.reducedMotion);
  const still = Boolean(osReduced) || appReduced;
  const grow = { type: "spring", stiffness: 120, damping: 14, mass: 0.6 } as const;
  const canopyEase = { duration: 1.1, ease: [0.22, 0.61, 0.36, 1] } as const;

  const { canopy, leaves, flowers, fruit, branches } = useMemo(() => {
    // Canopy radius grows with stage.
    const canopyR = [0, 14, 30, 46, 58, 70][stage];
    const canopyY = [150, 120, 96, 76, 62, 52][stage];

    const leafCount = Math.min(state.byType.leaves + stage * 3, 46);
    const flowerCount = Math.min(state.byType.flowers, stage >= 2 ? 10 : 0);
    const fruitCount = Math.min(state.byType.fruit, stage >= 4 ? 8 : 0);

    return {
      canopy: { r: canopyR, y: canopyY },
      leaves: Array.from({ length: leafCount }, (_, i) => ({
        i,
        ...placeInCanopy("leaves", i, canopyR, canopyY),
      })),
      flowers: Array.from({ length: flowerCount }, (_, i) => ({
        i,
        ...placeInCanopy("flowers", i, canopyR * 0.9, canopyY),
      })),
      fruit: Array.from({ length: fruitCount }, (_, i) => ({
        i,
        ...placeInCanopy("fruit", i, canopyR * 0.8, canopyY),
      })),
      branches:
        stage >= 2
          ? [
              "M110 150 C 96 120, 82 108, 74 96",
              "M110 150 C 124 118, 138 106, 146 94",
              "M110 130 C 110 110, 110 100, 110 82",
            ].slice(0, stage - 1)
          : [],
    };
  }, [stage, state.byType.leaves, state.byType.flowers, state.byType.fruit]);

  return (
    <svg
      viewBox="0 0 220 190"
      width={size}
      height={(size * 190) / 220}
      className={className}
      role="img"
      aria-label={`Your growth: ${state.stageLabel}`}
    >
      <defs>
        <radialGradient id="tree-light" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="var(--color-gold-100)" stopOpacity="0.8" />
          <stop offset="100%" stopColor="var(--color-gold-100)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft sunlight — grows with reflection */}
      {state.byType.sunlight > 0 && (
        <circle cx="110" cy={canopy.y} r={canopy.r + 24} fill="url(#tree-light)" />
      )}

      {showGround && (
        <>
          {/* Semantic surface so the ground stays subtle in Candle mode
              (raw olive-100 would glow near-white on a dark canvas). */}
          <ellipse
            cx="110"
            cy="172"
            rx="78"
            ry="9"
            fill="var(--color-accent-surface)"
          />
          <path
            d="M40 172 Q 110 166 180 172"
            stroke="var(--color-olive-300)"
            strokeWidth="1.2"
            fill="none"
            opacity="0.6"
          />
        </>
      )}

      {/* Seed / sprout early stages */}
      {stage === 0 && (
        <g className="ambient">
          <ellipse cx="110" cy="168" rx="7" ry="5" fill="var(--color-olive-500)" />
          <path
            d="M110 164 q 3 -6 7 -7"
            stroke="var(--color-olive-500)"
            strokeWidth="1.5"
            fill="none"
            className="origin-bottom [animation:var(--animate-sway-slow)]"
          />
        </g>
      )}

      {stage >= 1 && (
        <>
          {/* Trunk — thickens with stage */}
          <path
            d={`M${110 - (2 + stage)} 172 C ${108 - stage} ${150 - stage * 6}, ${
              108 - stage
            } ${canopy.y + 30}, 110 ${canopy.y + 10}
               C ${112 + stage} ${canopy.y + 30}, ${112 + stage} ${
              150 - stage * 6
            }, ${110 + (2 + stage)} 172 Z`}
            fill="#6b4f34"
            opacity="0.92"
          />

          {/* Branches — bark brown (shared pixel-palette tone) reads on both
              parchment and the dark Candle canvas; olive-700 vanished in dark. */}
          {branches.map((d, i) => (
            <path
              key={i}
              d={d}
              stroke="#6b4f34"
              strokeWidth={2.4 - i * 0.3}
              fill="none"
              strokeLinecap="round"
            />
          ))}

          {/* Canopy base */}
          {stage >= 1 && canopy.r > 0 && (
            <g className="ambient">
              <g className="origin-bottom [animation:var(--animate-sway)]">
                {/* The three canopy blobs ease outward on a stage-up (a breath,
                    not a pop). */}
                <motion.circle
                  cx="110"
                  fill="var(--color-olive-300)"
                  opacity="0.55"
                  animate={{ cy: canopy.y, r: canopy.r }}
                  transition={still ? { duration: 0 } : canopyEase}
                />
                <motion.circle
                  fill="var(--color-olive-300)"
                  opacity="0.45"
                  animate={{
                    cx: 110 - canopy.r * 0.5,
                    cy: canopy.y + canopy.r * 0.3,
                    r: canopy.r * 0.7,
                  }}
                  transition={still ? { duration: 0 } : canopyEase}
                />
                <motion.circle
                  fill="var(--color-olive-300)"
                  opacity="0.45"
                  animate={{
                    cx: 110 + canopy.r * 0.5,
                    cy: canopy.y + canopy.r * 0.25,
                    r: canopy.r * 0.7,
                  }}
                  transition={still ? { duration: 0 } : canopyEase}
                />

                {/* Individual leaves — each grows in once in its own stable
                    slot; cx/cy are animated so a stage-up eases the whole
                    canopy outward instead of teleporting. */}
                {leaves.map((l) => (
                  <motion.circle
                    key={`leaf-${l.i}`}
                    fill="var(--color-olive-500)"
                    initial={still ? false : { r: 0, opacity: 0 }}
                    animate={{ cx: l.x, cy: l.y, r: 2.1, opacity: 0.85 }}
                    transition={still ? { duration: 0 } : grow}
                  />
                ))}

                {/* Flowers — gratitude */}
                {flowers.map((f) => (
                  <motion.g
                    key={`flower-${f.i}`}
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                    initial={still ? false : { scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={still ? { duration: 0 } : grow}
                  >
                    <motion.circle
                      r={2.6}
                      fill="var(--color-rose-300)"
                      initial={false}
                      animate={{ cx: f.x, cy: f.y }}
                      transition={still ? { duration: 0 } : grow}
                    />
                    <motion.circle
                      r={1}
                      fill="var(--color-gold-300)"
                      initial={false}
                      animate={{ cx: f.x, cy: f.y }}
                      transition={still ? { duration: 0 } : grow}
                    />
                  </motion.g>
                ))}

                {/* Fruit — service */}
                {fruit.map((f) => (
                  <motion.circle
                    key={`fruit-${f.i}`}
                    fill="var(--color-gold-500)"
                    initial={still ? false : { r: 0, opacity: 0 }}
                    animate={{ cx: f.x, cy: f.y, r: 3, opacity: 1 }}
                    transition={still ? { duration: 0 } : grow}
                  />
                ))}
              </g>
            </g>
          )}
        </>
      )}
    </svg>
  );
}
