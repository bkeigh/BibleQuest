"use client";

import { useHydrated } from "@/lib/utils/useHydrated";

/**
 * Guards against hydration mismatch for components that read the persisted
 * (localStorage) QuestOS store. Renders `fallback` on the server + first
 * client paint, then the real children.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const hydrated = useHydrated();
  return <>{hydrated ? children : fallback}</>;
}
