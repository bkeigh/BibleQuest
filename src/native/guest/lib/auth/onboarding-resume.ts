"use client";

/** Stores only device-local first-run progress. */
const KEY = "biblequest:onboarding-pending";

export const ONBOARDING_RESUME_STAGES = [
  "account",
  "guide",
  "quest",
  "plus",
  "launch",
  "launch_quests",
  "launch_plus",
] as const;

export type OnboardingResumeStage =
  (typeof ONBOARDING_RESUME_STAGES)[number];

/** Reads one reviewed first-run stage from device storage. */
export function getOnboardingResumeStage(): OnboardingResumeStage | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    return ONBOARDING_RESUME_STAGES.includes(value as OnboardingResumeStage)
      ? (value as OnboardingResumeStage)
      : null;
  } catch {
    return null;
  }
}

/** Saves one device-only first-run stage. */
export function setOnboardingResumeStage(stage: OnboardingResumeStage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, stage);
  } catch {
    // The current tab can still finish when local storage is unavailable.
  }
}

/** Removes the device-only first-run stage. */
export function clearOnboardingResumeStage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing else needs clearing.
  }
}

/** Identifies unfinished guide stages without granting remote authority. */
export function isOnboardingResumePending(
  stage: OnboardingResumeStage | null,
): boolean {
  return (
    stage === "account" ||
    stage === "guide" ||
    stage === "quest" ||
    stage === "plus"
  );
}

/** Resolves a completed guide's exact local destination. */
export function onboardingLaunchDestination(
  stage: OnboardingResumeStage | null,
): "/app" | "/app/quests" | "/app/plus" | null {
  if (stage === "launch") return "/app";
  if (stage === "launch_quests") return "/app/quests";
  if (stage === "launch_plus") return "/app/plus";
  return null;
}

/** Keeps an unfinished local profile in the first-run guide. */
export function shouldRedirectAppToOnboarding(
  onboardingCompleted: boolean,
  stage: OnboardingResumeStage | null,
): boolean {
  void stage;
  return !onboardingCompleted;
}

/** Keeps only the optional final preview on the guide route. */
export function shouldKeepCompletedProfileOnOnboarding(
  onboardingCompleted: boolean,
  stage: OnboardingResumeStage | null,
): boolean {
  return onboardingCompleted && stage === "plus";
}

/** Never skips a guest guide step because no remote user can appear. */
export function shouldAdvanceOnboardingAccountStep(
  onboardingCompleted: boolean,
  userId: string | null,
): boolean {
  void onboardingCompleted;
  void userId;
  return false;
}

/** Records only the first entry into the local guide. */
export function shouldTrackOnboardingStarted(
  onboardingCompleted: boolean,
  stage: OnboardingResumeStage | null,
): boolean {
  return !(onboardingCompleted || isOnboardingResumePending(stage));
}
