"use client";

import { useSyncExternalStore } from "react";
import { useQuestOS } from "@/lib/questos/store";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Reads the current OS preference without retaining a stale MediaQueryList. */
function getSystemSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/** Keeps React in sync when the operating-system preference changes. */
function subscribeToSystemPreference(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Uses a stable server value so hydration can reconcile before reading the OS. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Combines BibleQuest's explicit setting with the live operating-system
 * preference. Either preference is enough to request complete stillness.
 */
export function useShouldReduceMotion(): boolean {
  const appPreference = useQuestOS(
    (state) => state.settings.appearance.reducedMotion,
  );
  const systemPreference = useSyncExternalStore(
    subscribeToSystemPreference,
    getSystemSnapshot,
    getServerSnapshot,
  );

  return appPreference || systemPreference;
}
