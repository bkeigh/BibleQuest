"use client";

import { useHydrated } from "@/lib/utils/useHydrated";
import { ShellSkeleton } from "./ShellSkeleton";

/**
 * Guards against hydration mismatch for components that read the persisted
 * (localStorage) QuestOS store. Renders `fallback` on the server + first
 * client paint, then the real children.
 *
 * The default fallback is the calm ShellSkeleton so screens never first-paint
 * blank. Pass `fallback={null}` (or your own node) for inline widgets where
 * a page-scale skeleton would be wrong.
 */
export function ClientOnly({
  children,
  fallback = <ShellSkeleton />,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const hydrated = useHydrated();
  return <>{hydrated ? children : fallback}</>;
}
