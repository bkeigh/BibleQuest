"use client";

/**
 * MilestoneReveal — a gentle, quiet acknowledgement when a pilgrimage marker
 * is reached. No confetti, no fanfare. It waits, then fades.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { seedMilestones } from "@/data/seed/milestones";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";
import { GentleButton } from "@/components/design-system/GentleButton";

const byKey = new Map(seedMilestones.map((m) => [m.key, m]));

export function MilestoneReveal() {
  const pending = useQuestOS((s) => s.pendingMilestones);
  const dismiss = useQuestOS((s) => s.dismissPendingMilestone);
  const key = pending[0];
  const milestone = key ? byKey.get(key) : null;

  return (
    <AnimatePresence>
      {milestone && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-dusk/20 px-6 backdrop-blur-sm"
          onClick={() => dismiss(milestone.key)}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-[var(--radius-card-lg)] border border-mist bg-paper p-8 text-center paper-shadow-lg"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold-50 ring-1 ring-gold-100">
              <PixelIcon
                name={(milestone.iconKey as PixelSpriteName) ?? "star"}
                size={7}
                animate
              />
            </div>
            <p className="text-[0.75rem] uppercase tracking-[0.18em] text-gold-700">
              A marker on your journey
            </p>
            <h2 className="mt-2 font-display text-[1.5rem] text-graphite">
              {milestone.title}
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
              {milestone.description}
            </p>
            <GentleButton
              variant="outline"
              size="sm"
              className="mt-6"
              onClick={() => dismiss(milestone.key)}
            >
              Continue
            </GentleButton>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
