"use client";

import { useEffect } from "react";
import { BottomNav } from "./BottomNav";
import { InstallPrompt } from "./InstallPrompt";
import { ToastProvider } from "@/components/design-system/Toast";
import { useQuestOS } from "@/lib/questos/store";
import { useHydrated } from "@/lib/utils/useHydrated";

/**
 * AppShell — container for the installed/private app experience.
 * Parchment canvas, safe-area aware, bottom navigation, gentle mount fade.
 * Also records the daily visit (drives warm return copy — never shame).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const recordVisit = useQuestOS((s) => s.recordVisit);
  const hydrated = useHydrated();

  useEffect(() => {
    // Record the visit *after* the current render reads lastVisitDateKey.
    const t = setTimeout(() => recordVisit(), 400);
    return () => clearTimeout(t);
  }, [recordVisit]);

  return (
    <ToastProvider>
      <div className="relative flex min-h-dvh flex-col bg-parchment">
        <main
          className={`flex-1 pb-28 transition-opacity duration-500 ${
            hydrated ? "opacity-100" : "opacity-0"
          }`}
        >
          {children}
        </main>
        <BottomNav />
        <InstallPrompt />
      </div>
    </ToastProvider>
  );
}
