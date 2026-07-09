"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuestOS } from "@/lib/questos/store";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PixelMascot } from "@/components/design-system/PixelMascot";

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
      <PixelMascot name="lantern" size={7} />
      <p className="text-small text-ash">Setting things up.</p>
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
