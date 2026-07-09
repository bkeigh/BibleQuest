"use client";

import { useEffect } from "react";
import { BottomNav } from "./BottomNav";
import { InstallPrompt } from "./InstallPrompt";
import { LanguageApplier } from "./LanguageApplier";
import { ToastProvider } from "@/components/design-system/Toast";
import { useQuestOS } from "@/lib/questos/store";

/**
 * AppShell — container for the installed/private app experience.
 * Parchment canvas, safe-area aware, bottom navigation.
 * Also records the daily visit (drives warm return copy — never shame).
 *
 * First paint is never blank: screens hydrate behind ClientOnly, whose
 * default fallback is the ShellSkeleton, so <main> renders immediately.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const recordVisit = useQuestOS((s) => s.recordVisit);

  useEffect(() => {
    // LOAD-BEARING TIMING: record the visit *after* the current render has
    // read `lastVisitDateKey`. Home's greeting compares today against the
    // previous visit — recording synchronously would overwrite it before the
    // greeting reads it. The 400ms delay is deliberate; do not remove.
    const t = setTimeout(() => recordVisit(), 400);
    return () => clearTimeout(t);
  }, [recordVisit]);

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
