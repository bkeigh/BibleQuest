"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuestOS } from "@/lib/questos/store";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PixelIcon } from "@/components/design-system/PixelIcon";

/**
 * Sends first-time visitors to onboarding before the app opens. Renders a
 * calm holding state while the persisted store hydrates on the client.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const completed = useQuestOS((s) => s.profile?.onboardingCompleted ?? false);

  useEffect(() => {
    if (!completed) router.replace("/onboarding");
  }, [completed, router]);

  if (!completed) {
    return <LoadingVeil />;
  }
  return <>{children}</>;
}

function LoadingVeil() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-parchment">
      <PixelIcon name="candle" size={8} animate />
      <p className="text-[0.9375rem] text-ash">Preparing today’s journey…</p>
    </div>
  );
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly fallback={<LoadingVeil />}>
      <Gate>{children}</Gate>
    </ClientOnly>
  );
}
