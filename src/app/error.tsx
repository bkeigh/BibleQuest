"use client";

import { useEffect } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";

/**
 * Root error boundary — covers marketing, onboarding, and anything outside
 * the /app segment (which has its own error.tsx inside the shell).
 */
export default function RootError({
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-parchment px-5 text-center">
      <h1 className="font-display text-editorial text-graphite">
        Something didn&rsquo;t load correctly.
      </h1>
      <p className="max-w-sm text-small text-ash">Try again in a moment.</p>
      <GentleButton variant="primary" className="mt-2" onClick={reset}>
        Try again
      </GentleButton>
    </div>
  );
}
