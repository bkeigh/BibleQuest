"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
import { listenForNativeReminderOpen } from "@/lib/native/reminders";
import { rehydrateNativeRouteState } from "@/lib/native/route-state";

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
  const router = useRouter();
  const { isPlus } = usePlus();
  const floatingMyShepherd = useQuestOS(
    (state) => state.settings.appearance.myShepherdFloatingButton !== false,
  );
  const hasCompletedQuest = useQuestOS((state) =>
    Object.values(state.myQuests).some((quest) => quest.status === "completed"),
  );
  const [installPromptVisible, setInstallPromptVisible] = useState(false);

  // Keeps the two persistent shell prompts mutually exclusive on small screens.
  const handleInstallPromptVisibility = useCallback((visible: boolean) => {
    setInstallPromptVisible(visible);
  }, []);
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
    // Native static routes can resume a cached screen after another route has
    // persisted a change. Re-read the canonical local snapshot at the route
    // boundary so profile and settings edits appear without an app restart.
    void rehydrateNativeRouteState();
  }, [pathname]);

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

  useEffect(() => {
    if (!isNativeTarget()) return;
    let removeListener: (() => Promise<void>) | undefined;
    let active = true;
    void listenForNativeReminderOpen(() => router.push("/app"))
      .then((remove) => {
        if (active) removeListener = remove;
        else void remove();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (removeListener) void removeListener();
    };
  }, [router]);

  return (
    <ToastProvider>
      <div
        data-app-shell
        className="relative isolate flex min-h-dvh flex-col bg-parchment"
      >
        <LanguageApplier />
        <WallpaperBackdrop />
        {/* Keep the keyboard-only escape hatch below a notched device's
            status area when it becomes visible. */}
        <a
          href="#app-main"
          className="sr-only z-50 rounded-[var(--radius-button)] bg-paper px-4 py-3 text-accent paper-shadow-lg focus:not-sr-only focus:fixed focus:start-4 focus:top-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))]"
        >
          Skip to content
        </a>
        {/* The bottom padding exists to clear the tab bar. On the routes that
            hide it, the same padding is just a strip of dead screen — which a
            full-height game notices more than a scrolling page would. */}
        <main
          id="app-main"
          tabIndex={-1}
          className={cn(
            "relative z-10 flex-1",
            !hidesBottomNav &&
              "pb-[calc(var(--app-bottom-nav-height,5rem)+1rem)]",
          )}
        >
          {children}
        </main>
        {/* Web readers may see the acquisition preview; native readers see the
            tool only after an existing entitlement resolves. */}
        {floatingMyShepherd &&
          !installPromptVisible &&
          !hidesFloatingTools &&
          (!isNativeTarget() || isPlus) && <FloatingMyShepherd />}
        <BottomNav />
        {/* Capture the browser's one-shot install event from launch, but keep
            the offer hidden until the first daily loop has earned it. */}
        <InstallPrompt
          eligible={hasCompletedQuest}
          onVisibilityChange={handleInstallPromptVisibility}
        />
      </div>
    </ToastProvider>
  );
}
