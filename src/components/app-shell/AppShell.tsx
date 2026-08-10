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
import { cn } from "@/lib/utils/cn";
import { isNativeTarget } from "@/lib/platform/target";
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
    (state) => state.settings.appearance.myShepherdFloatingButton !== false,
  );
  // Home already carries MyShepherd in the formation flow, where the large
  // launcher would duplicate the action and cover the restored card sequence.
  const hidesFloatingTools =
    pathname === "/app" ||
    pathname === "/app/shepherd" ||
    pathname === "/app/prayer/new" ||
    pathname === "/app/prayer/reflection/new" ||
    pathname === "/app/games/seven-days";
  // Kept in step with BottomNav's own list of full-screen routes.
  const hidesBottomNav =
    pathname === "/app/prayer/new" ||
    pathname === "/app/prayer/reflection/new" ||
    pathname === "/app/games/seven-days";

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
        {/* The bottom padding exists to clear the tab bar. On the routes that
            hide it, the same padding is just a strip of dead screen — which a
            full-height game notices more than a scrolling page would. */}
        <main
          id="app-main"
          tabIndex={-1}
          className={cn("relative z-10 flex-1", !hidesBottomNav && "pb-28")}
        >
          {children}
        </main>
        {/* Web readers may see the acquisition preview; native readers see the
            tool only after an existing entitlement resolves. */}
        {floatingMyShepherd &&
          !hidesFloatingTools &&
          (!isNativeTarget() || isPlus) && <FloatingMyShepherd />}
        <BottomNav />
        <InstallPrompt />
      </div>
    </ToastProvider>
  );
}
