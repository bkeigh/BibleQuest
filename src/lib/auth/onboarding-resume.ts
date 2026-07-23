"use client";

/**
 * Non-personal state for the account → guide → first-quest hand-off.
 * The completed QuestOS profile remains canonical; this value only resumes a
 * public onboarding screen after an auth round trip or same-tab navigation.
 */
const KEY = "biblequest:onboarding-account-pending";

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

/** These stages belong to onboarding, but never override a completed app profile. */
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

/** Exact safe destination selected by the first-quest CTA, if launch began. */
export function onboardingLaunchDestination(
  stage: OnboardingResumeStage | null,
): "/app" | "/app/quests" | "/app/plus" | null {
  if (stage === "launch") return "/app";
  if (stage === "launch_quests") return "/app/quests";
  if (stage === "launch_plus") return "/app/plus";
  return null;
}

/**
 * A completed profile is the canonical app-access signal. A stale onboarding
 * marker must never trap an established account in a PWA redirect loop.
 */
export function shouldRedirectAppToOnboarding(
  onboardingCompleted: boolean,
  stage: OnboardingResumeStage | null,
): boolean {
  void stage;
  return !onboardingCompleted;
}

/** Keeps only the intentional post-quest Plus preview on the public route. */
export function shouldKeepCompletedProfileOnOnboarding(
  onboardingCompleted: boolean,
  stage: OnboardingResumeStage | null,
): boolean {
  return onboardingCompleted && stage === "plus";
}

/** A newly restored session skips the account form even when another hook loaded first. */
export function shouldAdvanceOnboardingAccountStep(
  onboardingCompleted: boolean,
  userId: string | null,
): boolean {
  return !onboardingCompleted && Boolean(userId);
}

/** Resume/reload is continuation, not a second onboarding funnel start. */
export function shouldTrackOnboardingStarted(
  onboardingCompleted: boolean,
  stage: OnboardingResumeStage | null,
): boolean {
  return !(onboardingCompleted || isOnboardingResumePending(stage));
}
