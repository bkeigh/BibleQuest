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
import { useEffect, useState } from "react";
import { useQuestOS } from "@/lib/questos/store";
import {
  restoreJourneyIfEvicted,
  startJourneyBackup,
} from "@/lib/native/journey-backup";
import {
  NATIVE_TEXT_SIZE_CHANGE_EVENT,
  syncNativePreferredTextZoom,
} from "@/lib/native/accessibility";
import { isNativeTarget } from "@/lib/platform/target";
import { clearLegacyNativeAuthStorage } from "@/lib/supabase/native-auth-storage";
import { AppLoadingScreen } from "@/components/app-shell/AppLoadingScreen";

export function NativeJourneyGuard({ children }: { children: React.ReactNode }) {
  const nativeTarget = isNativeTarget();
  const [status, setStatus] = useState<"pending" | "ready" | "failed">(
    nativeTarget ? "pending" : "ready",
  );

  useEffect(() => {
    if (!nativeTarget) return;
    clearLegacyNativeAuthStorage();

    let stopBackup: (() => void) | null = null;
    let cancelled = false;

    /**
     * Hide after restore when JavaScript is healthy. Capacitor's 60-second
     * fallback is reserved for a bundle that never executes at all.
     */
    const hideSplash = async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        // Plugin missing or already hidden; the app is visible either way.
      }
    };

    void (async () => {
      try {
        const outcome = await restoreJourneyIfEvicted();
        if (cancelled) return;
        if (outcome === "failed") {
          setStatus("failed");
          return;
        }
        // Hydration is globally deferred, so both a healthy primary and a
        // repaired primary must reach the live store before children mount.
        await useQuestOS.persist.rehydrate();
        if (cancelled) return;
        // Apply Dynamic Type before either onboarding or the signed-in app can
        // appear, while the native launch screen still covers initialization.
        await syncNativePreferredTextZoom().catch(() => null);
        if (cancelled) return;
        // Started only after the restore decision, so the mirror can never be
        // overwritten with the empty state we were about to repair.
        stopBackup = startJourneyBackup();
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      } finally {
        void hideSplash();
      }
    })();

    return () => {
      cancelled = true;
      stopBackup?.();
    };
  }, [nativeTarget]);

  useEffect(() => {
    if (!nativeTarget) return;
    /** Refreshes Dynamic Type after a user changes it outside the app. */
    const syncTextZoom = () => {
      if (document.visibilityState === "visible") {
        void syncNativePreferredTextZoom().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", syncTextZoom);
    window.addEventListener(NATIVE_TEXT_SIZE_CHANGE_EVENT, syncTextZoom);
    return () => {
      document.removeEventListener("visibilitychange", syncTextZoom);
      window.removeEventListener(NATIVE_TEXT_SIZE_CHANGE_EVENT, syncTextZoom);
    };
  }, [nativeTarget]);

  // Match the native launch screen if its bounded auto-hide wins the race.
  if (status === "pending") return <AppLoadingScreen />;
  if (status === "failed") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-parchment px-6 text-charcoal">
        <div className="max-w-sm text-center" role="alert">
          <h1 className="font-display text-xl text-graphite">
            Your journey could not be restored safely
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ash">
            Nothing was synced or replaced. Close BibleQuest, then reopen it to
            try again.
          </p>
        </div>
      </main>
    );
  }
  return children;
}
