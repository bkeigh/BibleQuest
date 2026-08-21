"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { AppLoadingScreen } from "@/components/app-shell/AppLoadingScreen";
import {
  clearOnboardingResumeStage,
  getOnboardingResumeStage,
  onboardingLaunchDestination,
  shouldRedirectAppToOnboarding,
} from "@/lib/auth/onboarding-resume";
import { useQuestOS } from "@/lib/questos/store";

/** Keeps web-only Plus hand-offs inside the guest native route set. */
function safeLaunchDestination(
  stage: ReturnType<typeof getOnboardingResumeStage>,
) {
  const destination = onboardingLaunchDestination(stage);
  return destination === "/app/plus" ? "/app" : destination;
}

/** Preserves first-run and saved guest navigation without account recovery. */
function Gate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const completed = useQuestOS((state) =>
    state.profile?.onboardingCompleted ?? false,
  );
  const resumeStage = getOnboardingResumeStage();
  const redirectToOnboarding = shouldRedirectAppToOnboarding(
    completed,
    resumeStage,
  );
  const launchDestination = safeLaunchDestination(resumeStage);
  const redirectToLaunch = Boolean(
    launchDestination && pathname !== launchDestination,
  );

  useEffect(() => {
    if (redirectToOnboarding) {
      router.replace("/onboarding");
      return;
    }
    if (completed && resumeStage && !launchDestination) {
      clearOnboardingResumeStage();
      return;
    }
    if (launchDestination) {
      clearOnboardingResumeStage();
      if (redirectToLaunch) router.replace(launchDestination);
    }
  }, [
    completed,
    launchDestination,
    redirectToLaunch,
    redirectToOnboarding,
    resumeStage,
    router,
  ]);

  return redirectToOnboarding || redirectToLaunch ? (
    <AppLoadingScreen />
  ) : (
    <>{children}</>
  );
}

/** Redirects a completed guest profile away from the onboarding route. */
function OnboardingRouteGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const completed = useQuestOS((state) =>
    state.profile?.onboardingCompleted ?? false,
  );
  const resumeStage = getOnboardingResumeStage();
  const launchDestination = safeLaunchDestination(resumeStage);

  useEffect(() => {
    if (!completed) return;
    clearOnboardingResumeStage();
    router.replace(launchDestination ?? "/app");
  }, [completed, launchDestination, router]);

  return completed ? <AppLoadingScreen /> : <>{children}</>;
}

/** Mounts device-only services after client hydration. */
export function OnboardingGate({
  children,
  services,
}: {
  children: React.ReactNode;
  services?: React.ReactNode;
}) {
  return (
    <ClientOnly fallback={<AppLoadingScreen />}>
      {services}
      <Gate>{children}</Gate>
    </ClientOnly>
  );
}

/** Applies the same guest-only hold to the public onboarding route. */
export function OnboardingAccountRestoreGate({
  children,
  services,
}: {
  children: React.ReactNode;
  services?: React.ReactNode;
}) {
  return (
    <ClientOnly fallback={<AppLoadingScreen />}>
      {services}
      <OnboardingRouteGate>{children}</OnboardingRouteGate>
    </ClientOnly>
  );
}
