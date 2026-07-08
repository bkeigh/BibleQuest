"use client";

import { MotionConfig } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";

/**
 * Makes the in-app "Reduce motion" setting authoritative for framer-motion.
 * framer's own reduced-motion only reads the OS query, so a user who toggles
 * the setting on a device with no OS preference would still see motion. Wiring
 * MotionConfig to the setting fixes that; "user" still honors the OS query when
 * the app toggle is off.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const reduced = useQuestOS((s) => s.settings.appearance.reducedMotion);
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      {children}
    </MotionConfig>
  );
}
