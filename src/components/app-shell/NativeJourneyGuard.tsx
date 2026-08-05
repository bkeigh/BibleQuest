"use client";

/**
 * Keeps the journey alive across iOS storage eviction.
 *
 * Renders nothing. On web it does nothing at all — every call inside is gated
 * on the native target, and the Filesystem plugin is imported lazily so it
 * never reaches the web bundle.
 *
 * Ordering note: the store hydrates from localStorage when its module is first
 * imported, which is before any component mounts. If the primary was evicted,
 * that hydration produces an empty journey — so after repairing localStorage
 * from the mirror this asks the store to rehydrate, which re-reads the now
 * restored value. The healthy path never calls it, so normal launches keep
 * exactly the timing they had before.
 */
import { useEffect } from "react";
import { useQuestOS } from "@/lib/questos/store";
import {
  restoreJourneyIfEvicted,
  startJourneyBackup,
} from "@/lib/native/journey-backup";
import { isNativeTarget } from "@/lib/platform/target";

export function NativeJourneyGuard() {
  useEffect(() => {
    if (!isNativeTarget()) return;

    let stopBackup: (() => void) | null = null;
    let cancelled = false;

    /**
     * The splash is configured with `launchAutoHide: false` so it covers the
     * restore rather than revealing an empty journey that then pops back. It
     * must be hidden on every path — a failed restore that left the splash up
     * would strand the app on a blank screen.
     */
    const hideSplash = async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        // Plugin missing or already hidden; the app is visible either way.
      }
    };

    void restoreJourneyIfEvicted()
      .then((outcome) => {
        if (cancelled) return;
        if (outcome === "restored") {
          void useQuestOS.persist.rehydrate();
        }
        // Started only after the restore decision, so the mirror can never be
        // overwritten with the empty state we were about to repair.
        stopBackup = startJourneyBackup();
      })
      .finally(() => {
        void hideSplash();
      });

    return () => {
      cancelled = true;
      stopBackup?.();
    };
  }, []);

  return null;
}
