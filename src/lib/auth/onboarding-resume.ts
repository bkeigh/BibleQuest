"use client";

/**
 * Non-personal state for the short profile → account → first-quest hand-off.
 * Profile answers remain in QuestOS; this value records only which screen is
 * pending so reopening the PWA at `/app` cannot bypass onboarding.
 */
const KEY = "biblequest:onboarding-account-pending";

export const ONBOARDING_RESUME_STAGES = [
  "account",
  "quest",
  "launch",
  "launch_quests",
] as const;

export type OnboardingResumeStage =
  (typeof ONBOARDING_RESUME_STAGES)[number];

export function getOnboardingResumeStage(): OnboardingResumeStage | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    if (value === null) return null;
    return ONBOARDING_RESUME_STAGES.includes(value as OnboardingResumeStage)
      ? (value as OnboardingResumeStage)
      : "account";
  } catch {
    return null;
  }
}

export function setOnboardingResumeStage(stage: OnboardingResumeStage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, stage);
  } catch {
    // A storage-disabled browser can still finish in the current tab. If auth
    // opens another context, the ordinary onboarding route is the safe fallback.
  }
}

export function clearOnboardingResumeStage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing else to clear.
  }
}

/** Account/quest are unfinished; launch means the finish CTA was intentional. */
export function isOnboardingResumePending(
  stage: OnboardingResumeStage | null,
): boolean {
  return stage === "account" || stage === "quest";
}

/** Exact safe destination selected by the first-quest CTA, if launch began. */
export function onboardingLaunchDestination(
  stage: OnboardingResumeStage | null,
): "/app" | "/app/quests" | null {
  if (stage === "launch") return "/app";
  if (stage === "launch_quests") return "/app/quests";
  return null;
}

/** Pure app-gate decision, exported so the PWA reopen contract stays tested. */
export function shouldRedirectAppToOnboarding(
  onboardingCompleted: boolean,
  stage: OnboardingResumeStage | null,
): boolean {
  return !onboardingCompleted || isOnboardingResumePending(stage);
}

/** Resume/reload is continuation, not a second onboarding funnel start. */
export function shouldTrackOnboardingStarted(
  onboardingCompleted: boolean,
  stage: OnboardingResumeStage | null,
): boolean {
  return !(onboardingCompleted && isOnboardingResumePending(stage));
}
