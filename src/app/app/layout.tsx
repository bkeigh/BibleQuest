import { AppShell } from "@/components/app-shell/AppShell";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { MilestoneReveal } from "@/components/journey/MilestoneReveal";
import { ThemeApplier } from "@/components/app-shell/ThemeApplier";
import { MotionProvider } from "@/components/app-shell/MotionProvider";
import { SyncManager } from "@/components/app-shell/SyncManager";
import { PlusProvider } from "@/lib/revenuecat/usePlus";

export default function PrivateAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SyncManager />
      <OnboardingGate>
        <PlusProvider>
          <ThemeApplier />
          <MotionProvider>
            <AppShell>{children}</AppShell>
            <MilestoneReveal />
          </MotionProvider>
        </PlusProvider>
      </OnboardingGate>
    </>
  );
}
