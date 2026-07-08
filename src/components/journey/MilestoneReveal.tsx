"use client";

/**
 * MilestoneReveal — a gentle, quiet acknowledgement when a pilgrimage marker
 * is reached. No confetti, no fanfare. It waits, then fades.
 *
 * The dialog traps focus while open, restores it on close, dismisses on Escape
 * or backdrop tap, and is announced to screen readers as a modal dialog.
 */
import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { seedMilestones } from "@/data/seed/milestones";
import { PixelIcon, type PixelSpriteName } from "@/components/design-system/PixelIcon";
import { GentleButton } from "@/components/design-system/GentleButton";
import type { MilestoneSeed } from "@/lib/questos/types";

const byKey = new Map(seedMilestones.map((m) => [m.key, m]));

export function MilestoneReveal() {
  const pending = useQuestOS((s) => s.pendingMilestones);
  const dismiss = useQuestOS((s) => s.dismissPendingMilestone);
  const key = pending[0];
  const milestone = key ? byKey.get(key) : null;

  return (
    <AnimatePresence>
      {milestone && (
        <MilestoneDialog
          key={milestone.key}
          milestone={milestone}
          onDismiss={() => dismiss(milestone.key)}
        />
      )}
    </AnimatePresence>
  );
}

function MilestoneDialog({
  milestone,
  onDismiss,
}: {
  milestone: MilestoneSeed;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Keep the latest onDismiss without re-running the focus effect on re-render.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const getFocusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );

    // Land focus inside the dialog (the Continue button).
    getFocusable()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismissRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const f = getFocusable();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only restore focus if it's still inside THIS dialog. When a second
      // milestone is queued, this dialog exits AFTER the next one has mounted
      // and taken focus — restoring here would yank focus out of the open one.
      if (node && node.contains(document.activeElement)) {
        previouslyFocused?.focus?.();
      }
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-dusk/20 px-6 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
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
        <h2 id={titleId} className="mt-2 font-display text-[1.5rem] text-graphite">
          {milestone.title}
        </h2>
        <p id={descId} className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
          {milestone.description}
        </p>
        <GentleButton
          variant="outline"
          size="sm"
          className="mt-6"
          onClick={onDismiss}
        >
          Continue
        </GentleButton>
      </motion.div>
    </motion.div>
  );
}
