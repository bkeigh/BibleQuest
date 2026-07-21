"use client";

import { useLayoutEffect } from "react";
import { MotionConfig, MotionGlobalConfig } from "framer-motion";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";

/**
 * Makes the app and operating-system preferences authoritative for all Framer
 * descendants, including opacity animations that reducedMotion alone retains.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const reduced = useShouldReduceMotion();

  // Existing Framer VisualElements snapshot provider options when they mount.
  // The global flag covers future animations without remounting the entire app,
  // and finishing active animations prevents a half-transitioned UI.
  useLayoutEffect(() => {
    MotionGlobalConfig.skipAnimations = reduced;
    if (reduced && typeof document.getAnimations === "function") {
      for (const animation of document.getAnimations()) {
        try {
          animation.finish();
        } catch {
          animation.cancel();
        }
      }
    }
    return () => {
      MotionGlobalConfig.skipAnimations = false;
    };
  }, [reduced]);

  return (
    <MotionConfig
      reducedMotion={reduced ? "always" : "never"}
      skipAnimations={reduced}
    >
      {children}
    </MotionConfig>
  );
}
