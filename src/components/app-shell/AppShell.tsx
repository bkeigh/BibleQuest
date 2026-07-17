"use client";

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

/**
 * AppShell — container for the installed/private app experience.
 * Parchment canvas, safe-area aware, bottom navigation.
 * Also records the daily visit (feeds Journey's has-visited state).
 *
 * First paint is never blank: screens hydrate behind ClientOnly, whose
 * default fallback is the ShellSkeleton, so <main> renders immediately.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const recordVisit = useQuestOS((s) => s.recordVisit);

  useEffect(() => {
    // Deferred so the first paint isn't competing with a store write. The
    // original beneficiary (Home's welcome-back line, which snapshotted
    // lastVisitDateKey at mount) is gone; today's only reader is Journey's
    // null-check, which doesn't care about ordering.
    const t = setTimeout(() => recordVisit(), 400);
    return () => clearTimeout(t);
  }, [recordVisit]);

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
      <div className="relative flex min-h-dvh flex-col bg-parchment">
        <LanguageApplier />
        <main className="flex-1 pb-28">{children}</main>
        <BottomNav />
        <InstallPrompt />
      </div>
    </ToastProvider>
  );
}
