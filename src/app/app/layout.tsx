import { AppShell } from "@/components/app-shell/AppShell";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { MilestoneReveal } from "@/components/journey/MilestoneReveal";
import { ThemeApplier } from "@/components/app-shell/ThemeApplier";
import { MotionProvider } from "@/components/app-shell/MotionProvider";
import { SyncManager } from "@/components/app-shell/SyncManager";
import { AvatarSyncManager } from "@/components/app-shell/AvatarSyncManager";
import { PlusProvider } from "@/lib/billing/usePlus";
import { PRIVATE_APP_METADATA } from "@/lib/metadata";
import { JournalDraftJanitor } from "@/components/journal/JournalDraftJanitor";

export const metadata = PRIVATE_APP_METADATA;

export default function PrivateAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingGate
      services={
        <>
          <SyncManager />
          <AvatarSyncManager />
          <JournalDraftJanitor />
        </>
      }
    >
        <PlusProvider>
          <ThemeApplier />
          <MotionProvider>
            <AppShell>{children}</AppShell>
            <MilestoneReveal />
          </MotionProvider>
        </PlusProvider>
    </OnboardingGate>
  );
}
