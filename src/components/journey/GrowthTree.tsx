"use client";

/**
 * GrowthTree — the living emotional center of the journey.
 *
 * The tree grows through six stages and never decays. Prayer feeds roots,
 * Scripture the branches, kindness the leaves, service the fruit, reflection
 * the light, gratitude the flowers. It is an illustration, not a chart.
 */
import { useMemo } from "react";
import type { GrowthTreeState, TreeStage } from "@/lib/questos/types";
import { hashString, seededRandom } from "@/lib/utils/dates";

const STAGE_INDEX: Record<TreeStage, number> = {
  seed: 0,
  sprout: 1,
  young: 2,
  growing: 3,
  "fruit-bearing": 4,
  sheltering: 5,
};

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

  // Deterministic layout keyed to the tree's shape so it's stable per user.
  const rand = useMemo(
    () => seededRandom(hashString(`tree:${state.totalActions}`)),
    [state.totalActions]
  );

  const { canopy, leaves, flowers, fruit, branches } = useMemo(() => {
    // Canopy radius grows with stage.
    const canopyR = [0, 14, 30, 46, 58, 70][stage];
    const canopyY = [150, 120, 96, 76, 62, 52][stage];

    const leafCount = Math.min(state.byType.leaves + stage * 3, 46);
    const flowerCount = Math.min(state.byType.flowers, stage >= 2 ? 10 : 0);
    const fruitCount = Math.min(state.byType.fruit, stage >= 4 ? 8 : 0);

    const inCanopy = (r: number) => {
      // random point within canopy circle
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * r;
      return { x: 110 + Math.cos(a) * rr, y: canopyY + Math.sin(a) * rr * 0.9 };
    };

    return {
      canopy: { r: canopyR, y: canopyY },
      leaves: Array.from({ length: leafCount }, () => inCanopy(canopyR)),
      flowers: Array.from({ length: flowerCount }, () => inCanopy(canopyR * 0.9)),
      fruit: Array.from({ length: fruitCount }, () => inCanopy(canopyR * 0.8)),
      branches:
        stage >= 2
          ? [
              "M110 150 C 96 120, 82 108, 74 96",
              "M110 150 C 124 118, 138 106, 146 94",
              "M110 130 C 110 110, 110 100, 110 82",
            ].slice(0, stage - 1)
          : [],
    };
  }, [stage, state.byType, rand]);

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
          <stop offset="0%" stopColor="var(--color-gold-50)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--color-gold-50)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft sunlight — grows with reflection */}
      {state.byType.sunlight > 0 && (
        <circle cx="110" cy={canopy.y} r={canopy.r + 24} fill="url(#tree-light)" />
      )}

      {showGround && (
        <>
          <ellipse cx="110" cy="172" rx="78" ry="9" fill="var(--color-olive-100)" />
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
            fill="var(--color-olive-700)"
            opacity="0.92"
          />

          {/* Branches */}
          {branches.map((d, i) => (
            <path
              key={i}
              d={d}
              stroke="var(--color-olive-700)"
              strokeWidth={2.4 - i * 0.3}
              fill="none"
              strokeLinecap="round"
            />
          ))}

          {/* Canopy base */}
          {stage >= 1 && canopy.r > 0 && (
            <g className="ambient">
              <g className="origin-bottom [animation:var(--animate-sway)]">
                <circle
                  cx="110"
                  cy={canopy.y}
                  r={canopy.r}
                  fill="var(--color-olive-300)"
                  opacity="0.55"
                />
                <circle
                  cx={110 - canopy.r * 0.5}
                  cy={canopy.y + canopy.r * 0.3}
                  r={canopy.r * 0.7}
                  fill="var(--color-olive-300)"
                  opacity="0.45"
                />
                <circle
                  cx={110 + canopy.r * 0.5}
                  cy={canopy.y + canopy.r * 0.25}
                  r={canopy.r * 0.7}
                  fill="var(--color-olive-300)"
                  opacity="0.45"
                />

                {/* Individual leaves */}
                {leaves.map((l, i) => (
                  <circle
                    key={`leaf-${i}`}
                    cx={l.x}
                    cy={l.y}
                    r={2.1}
                    fill="var(--color-olive-500)"
                    opacity="0.85"
                  />
                ))}

                {/* Flowers — gratitude */}
                {flowers.map((f, i) => (
                  <g key={`flower-${i}`}>
                    <circle cx={f.x} cy={f.y} r={2.6} fill="var(--color-rose-300)" />
                    <circle cx={f.x} cy={f.y} r={1} fill="var(--color-gold-300)" />
                  </g>
                ))}

                {/* Fruit — service */}
                {fruit.map((f, i) => (
                  <circle
                    key={`fruit-${i}`}
                    cx={f.x}
                    cy={f.y}
                    r={3}
                    fill="var(--color-gold-500)"
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
