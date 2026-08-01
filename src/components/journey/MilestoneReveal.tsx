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
import { celebrationScale, pixelSparkle } from "@/lib/motion";
import { resolvePendingMilestones } from "@/lib/questos/milestone-engine";
import type { MilestoneSeed } from "@/lib/questos/types";

const byKey = new Map(seedMilestones.map((m) => [m.key, m]));
const knownKeys = new Set(byKey.keys());
let activeModalLocks = 0;
let restoreModalEnvironment: (() => void) | null = null;
let modalFocusOrigin: HTMLElement | null = null;

/** Reference-count the shell lock so queued milestone transitions stay inert. */
function lockModalEnvironment(focusOrigin: HTMLElement | null): () => void {
  if (activeModalLocks === 0) {
    const appShell = document.querySelector<HTMLElement>("[data-app-shell]");
    const shellWasInert = appShell?.hasAttribute("inert") ?? false;
    const previousBodyOverflow = document.body.style.overflow;
    appShell?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    modalFocusOrigin = focusOrigin;
    restoreModalEnvironment = () => {
      if (!shellWasInert) appShell?.removeAttribute("inert");
      document.body.style.overflow = previousBodyOverflow;
      if (modalFocusOrigin?.isConnected) modalFocusOrigin.focus();
      modalFocusOrigin = null;
    };
  }
  activeModalLocks += 1;
  return () => {
    activeModalLocks = Math.max(0, activeModalLocks - 1);
    if (activeModalLocks === 0) {
      restoreModalEnvironment?.();
      restoreModalEnvironment = null;
    }
  };
}

export function MilestoneReveal() {
  const pending = useQuestOS((s) => s.pendingMilestones);
  const dismiss = useQuestOS((s) => s.dismissPendingMilestone);
  const key = resolvePendingMilestones(pending, knownKeys).nextKey;
  const milestone = key ? byKey.get(key) : null;

  useEffect(() => {
    // Retired catalogue keys never block a later valid reveal or surface UI.
    const { staleKeys } = resolvePendingMilestones(pending, knownKeys);
    for (const staleKey of staleKeys) dismiss(staleKey);
  }, [dismiss, pending]);

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
    const releaseModalEnvironment = lockModalEnvironment(previouslyFocused);
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
      releaseModalEnvironment();
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
        variants={celebrationScale}
        initial="hidden"
        animate="visible"
        exit={{ opacity: 0, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="pixel-frame-gold w-full max-w-sm bg-paper p-8 text-center paper-shadow-lg"
      >
        <motion.div
          variants={pixelSparkle}
          initial="hidden"
          animate="visible"
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold-500/15 ring-1 ring-gold-500/30"
        >
          <PixelIcon
            name={(milestone.iconKey as PixelSpriteName) ?? "star"}
            size={104}
            animate
          />
        </motion.div>
        <p className="flex items-center justify-center gap-2 font-pixel text-[0.875rem] uppercase tracking-[0.12em] text-gilt">
          <PixelIcon name="star" size={44} /> Milestone reached
          <PixelIcon name="star" size={44} />
        </p>
        <h2
          id={titleId}
          className="mt-2 font-pixel text-[1.5rem] leading-tight text-graphite"
        >
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
