import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { SyncManager } from "@/components/app-shell/SyncManager";
import { OnboardingAccountRestoreGate } from "@/components/onboarding/OnboardingGate";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <SyncManager />
      <OnboardingAccountRestoreGate>
        <OnboardingFlow signInFailed={error === "signin"} />
      </OnboardingAccountRestoreGate>
    </>
  );
}
