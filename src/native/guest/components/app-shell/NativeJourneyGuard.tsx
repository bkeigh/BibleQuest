"use client";

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
    /** Applies one fresh native scale regardless of WebView visibility. */
    const syncTextZoom = (event?: Event) => {
      // SceneDelegate supplies an uncached scale for live iOS changes; other
      // triggers ask the plugin for the current preferred value.
      const requested =
        event instanceof CustomEvent && typeof event.detail === "number"
          ? event.detail
          : undefined;
      void syncNativePreferredTextZoom(undefined, requested).catch(
        () => undefined,
      );
    };
    /** Refreshes after the app returns from iOS Settings. */
    const syncVisibleTextZoom = () => {
      if (document.visibilityState === "visible") syncTextZoom();
    };
    document.addEventListener("visibilitychange", syncVisibleTextZoom);
    window.addEventListener(NATIVE_TEXT_SIZE_CHANGE_EVENT, syncTextZoom);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibleTextZoom);
      window.removeEventListener(NATIVE_TEXT_SIZE_CHANGE_EVENT, syncTextZoom);
    };
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
