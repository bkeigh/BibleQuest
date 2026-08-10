"use client";

/**
 * Runs native startup repair before the installed app becomes interactive.
 *
 * It removes the retired plaintext auth blob, then keeps the journey alive
 * across iOS storage eviction. On web it does nothing; native plugins remain
 * lazily imported and never reach the browser bundle.
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
import { clearLegacyNativeAuthStorage } from "@/lib/supabase/native-auth-storage";

export function NativeJourneyGuard() {
  useEffect(() => {
    if (!isNativeTarget()) return;
    clearLegacyNativeAuthStorage();

    let stopBackup: (() => void) | null = null;
    let cancelled = false;

    /**
     * Hide after restore when JavaScript is healthy. Capacitor's three-second
     * auto-hide remains the bounded fallback if this bundle never executes.
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
