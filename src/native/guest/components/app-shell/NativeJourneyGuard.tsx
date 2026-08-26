"use client";

import { useEffect, useState } from "react";
import { useQuestOS } from "@/lib/questos/store";
import {
  restoreJourneyIfEvicted,
  startJourneyBackup,
} from "@/lib/native/journey-backup";
import { syncNativePreferredTextZoom } from "@/lib/native/accessibility";
import { isNativeTarget } from "@/lib/platform/target";
import { AppLoadingScreen } from "@/components/app-shell/AppLoadingScreen";

/** Restores the protected device journey before local screens become interactive. */
export function NativeJourneyGuard({ children }: { children: React.ReactNode }) {
  const nativeTarget = isNativeTarget();
  const [status, setStatus] = useState<"pending" | "ready" | "failed">(
    nativeTarget ? "pending" : "ready",
  );

  useEffect(() => {
    if (!nativeTarget) return;
    let stopBackup: (() => void) | null = null;
    let cancelled = false;

    /** Hides the launch picture after the bounded restore decision finishes. */
    const hideSplash = async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        // Missing or already hidden still leaves the app visible.
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
        await useQuestOS.persist.rehydrate();
        if (cancelled) return;
        // Apply Dynamic Type before either onboarding or the guest app can
        // appear, while the native launch screen still covers initialization.
        await syncNativePreferredTextZoom().catch(() => null);
        if (cancelled) return;
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
    return () => document.removeEventListener("visibilitychange", syncTextZoom);
  }, [nativeTarget]);

  if (status === "pending") return <AppLoadingScreen />;
  if (status === "failed") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-parchment px-6 text-charcoal">
        <div className="max-w-sm text-center" role="alert">
          <h1 className="font-display text-xl text-graphite">
            Your journey could not be restored safely
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ash">
            Nothing was replaced. Close BibleQuest, then reopen it to try
            again.
          </p>
        </div>
      </main>
    );
  }
  return children;
}
