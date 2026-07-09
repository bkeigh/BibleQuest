"use client";

import { useEffect } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";

/**
 * Route-level error boundary for /app screens. Renders inside AppShell, so
 * the bottom nav stays available — a failed screen never strands the user.
 * Everything is local-first; nothing is lost when a render fails.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-safe sm:px-8">
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-display text-editorial text-graphite">
          Something didn&rsquo;t load correctly.
        </h1>
        <p className="max-w-sm text-small text-ash">
          Try again in a moment. Everything you&rsquo;ve saved is still on this
          device.
        </p>
        <GentleButton variant="primary" className="mt-2" onClick={reset}>
          Try again
        </GentleButton>
      </div>
    </div>
  );
}
