import { AppShell } from "@/components/app-shell/AppShell";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { MilestoneReveal } from "@/components/journey/MilestoneReveal";
import { ThemeApplier } from "@/components/app-shell/ThemeApplier";

export default function PrivateAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingGate>
      <ThemeApplier />
      <AppShell>{children}</AppShell>
      <MilestoneReveal />
    </OnboardingGate>
  );
}
