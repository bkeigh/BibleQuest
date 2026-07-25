import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { SyncManager } from "@/components/app-shell/SyncManager";
import { OnboardingAccountRestoreGate } from "@/components/onboarding/OnboardingGate";
import { parseAuthFailureReason } from "@/lib/auth/errors";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata = privateRouteMetadata("Welcome", "/onboarding");

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
        <OnboardingFlow authFailure={parseAuthFailureReason(error)} />
      </OnboardingAccountRestoreGate>
    </>
  );
}
