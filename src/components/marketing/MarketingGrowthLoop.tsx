"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";

// These five checkpoints tell the full growth story without rushing the loop.
const GROWTH_STAGES: ReadonlyArray<{
  sprite: PixelSpriteName;
  label: string;
}> = [
  { sprite: "tree-stage-0", label: "A seed is planted" },
  { sprite: "tree-stage-4", label: "Roots take hold" },
  { sprite: "tree-stage-9", label: "New growth appears" },
  { sprite: "tree-stage-14", label: "Branches reach outward" },
  { sprite: "tree-stage-19", label: "A life of faith takes shape" },
];

/** Loops through the journey tree with a quiet crossfade for the landing page. */
export function MarketingGrowthLoop() {
  const reduceMotion = useReducedMotion();
  const [activeStage, setActiveStage] = useState(0);

  // Keep the mature tree still when the visitor has asked for reduced motion.
  useEffect(() => {
    if (reduceMotion) return;

    const interval = window.setInterval(() => {
      setActiveStage((current) => (current + 1) % GROWTH_STAGES.length);
    }, 3400);

    return () => window.clearInterval(interval);
  }, [reduceMotion]);

  const visibleStage = reduceMotion ? GROWTH_STAGES.length - 1 : activeStage;
  const stage = GROWTH_STAGES[visibleStage];

  return (
    <div
      className="relative mx-auto flex min-h-[17rem] w-full max-w-sm flex-col items-center justify-center"
      role="img"
      aria-label={`BibleQuest journey growth: ${stage.label}`}
    >
      <div className="relative flex h-56 w-56 items-end justify-center sm:h-64 sm:w-64">
        <div
          aria-hidden="true"
          className="absolute inset-x-4 bottom-3 h-5 rounded-full bg-black/15 blur-md"
        />
        <AnimatePresence initial={false}>
          <motion.div
            key={stage.sprite}
            className="absolute inset-0 flex items-center justify-center"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.85, ease: "easeInOut" }}
          >
            <PixelIcon name={stage.sprite} size={7} className="mx-auto" />
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="mt-2 min-h-7 text-center font-display text-[1.25rem] text-graphite">
        {stage.label}
      </p>
      <div className="mt-3 flex gap-2" aria-hidden="true">
        {GROWTH_STAGES.map((growthStage, index) => (
          <span
            key={growthStage.sprite}
            className={`h-1.5 rounded-full transition-[width,background-color] duration-500 ${
              index === visibleStage ? "w-7 bg-gold-500" : "w-1.5 bg-mist"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
