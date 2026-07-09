import { ShellSkeleton } from "@/components/app-shell/ShellSkeleton";

/**
 * Route-level loading state for every /app screen. Renders inside AppShell
 * (nav stays put) so navigation always gives immediate feedback instead of
 * a blank main area.
 */
export default function Loading() {
  return <ShellSkeleton />;
}
