"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BottomNav } from "./BottomNav";
import { InstallPrompt } from "./InstallPrompt";
import { LanguageApplier } from "./LanguageApplier";
import { ToastProvider } from "@/components/design-system/Toast";
import { useQuestOS } from "@/lib/questos/store";
import {
  flushAnalyticsQueue,
  subscribeToAnalyticsConsent,
} from "@/lib/analytics/events";
import { WallpaperBackdrop } from "./WallpaperBackdrop";
import { usePlus } from "@/lib/billing/usePlus";

const FloatingMyShepherd = dynamic(
  () =>
    import("@/components/shepherd/FloatingMyShepherd").then(
      (module) => module.FloatingMyShepherd,
    ),
  { ssr: false },
);

/**
 * AppShell — container for the installed/private app experience.
 * Parchment canvas, safe-area aware, bottom navigation.
 *
 * First paint is never blank: screens hydrate behind ClientOnly, whose
 * default fallback is the ShellSkeleton, so <main> renders immediately.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isPlus } = usePlus();
  const floatingMyShepherd = useQuestOS(
    (state) => state.settings.appearance.myShepherdFloatingButton === true,
  );
  const hidesFloatingTools =
    pathname === "/app/shepherd" ||
    pathname === "/app/prayer/new" ||
    pathname === "/app/prayer/reflection/new";

  useEffect(() => {
    // Analytics events queued while offline flush when the shell mounts
    // and whenever the connection returns. Both are no-ops when analytics
    // is unconfigured or the user has opted out.
    flushAnalyticsQueue();
    window.addEventListener("online", flushAnalyticsQueue);
    return () => window.removeEventListener("online", flushAnalyticsQueue);
  }, []);

  useEffect(
    () =>
      subscribeToAnalyticsConsent((analyticsConsent) => {
        // Storage events do not update Zustand automatically. Keep the toggle
        // honest when another tab changes the explicit consent record.
        const state = useQuestOS.getState();
        if (state.settings.analyticsConsent !== analyticsConsent) {
          useQuestOS.setState({
            settings: { ...state.settings, analyticsConsent },
          });
        }
      }),
    []
  );

  return (
    <ToastProvider>
      <div
        data-app-shell
        className="relative isolate flex min-h-dvh flex-col bg-parchment"
      >
        <LanguageApplier />
        <WallpaperBackdrop />
        <a
          href="#app-main"
          className="sr-only z-50 rounded-[var(--radius-button)] bg-paper px-4 py-3 text-accent paper-shadow-lg focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          Skip to content
        </a>
        <main id="app-main" tabIndex={-1} className="relative z-10 flex-1 pb-28">
          {children}
        </main>
        {/* Plus members can opt into a lightweight assistant on safe app routes. */}
        {isPlus && floatingMyShepherd && !hidesFloatingTools && (
          <FloatingMyShepherd />
        )}
        <BottomNav />
        <InstallPrompt />
      </div>
    </ToastProvider>
  );
}
