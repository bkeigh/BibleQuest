"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconEye, IconEyeOff } from "@/components/design-system/icons";

/**
 * Removes sensitive editor content from the rendered tree after BibleQuest
 * leaves the foreground. Returning requires an intentional reveal; this is a
 * visual privacy measure, not a claim of device-storage encryption.
 */
export function JournalPrivacyBoundary({
  children,
  onBackground,
}: {
  children: ReactNode;
  onBackground?: () => void;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function hideWhenBackgrounded() {
      if (document.visibilityState !== "hidden") return;
      onBackground?.();
      setHidden(true);
    }
    document.addEventListener("visibilitychange", hideWhenBackgrounded);
    return () =>
      document.removeEventListener("visibilitychange", hideWhenBackgrounded);
  }, [onBackground]);

  if (!hidden) return children;

  return (
    <PageContainer className="pt-safe">
      <PaperCard
        variant="atmospheric"
        padding="lg"
        className="mt-10 text-center"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-linen ring-1 ring-mist">
          <IconEyeOff size={24} className="text-accent" />
        </div>
        <h1 className="mt-4 font-display text-[1.25rem] text-graphite">
          Your writing is hidden
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[0.875rem] leading-relaxed text-ash">
          BibleQuest obscures an open journal editor whenever the app leaves
          the foreground. This privacy screen does not encrypt browser storage.
        </p>
        <GentleButton
          variant="primary"
          size="md"
          className="mt-5"
          onClick={() => setHidden(false)}
        >
          <IconEye size={18} /> Continue writing
        </GentleButton>
      </PaperCard>
    </PageContainer>
  );
}
