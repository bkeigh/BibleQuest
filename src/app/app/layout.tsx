import { AppShell } from "@/components/app-shell/AppShell";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { MilestoneReveal } from "@/components/journey/MilestoneReveal";
import { ThemeApplier } from "@/components/app-shell/ThemeApplier";
import { MotionProvider } from "@/components/app-shell/MotionProvider";

export default function PrivateAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingGate>
      <ThemeApplier />
      <MotionProvider>
        <AppShell>{children}</AppShell>
        <MilestoneReveal />
      </MotionProvider>
    </OnboardingGate>
  );
}
