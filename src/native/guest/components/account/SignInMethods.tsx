"use client";

import { ACCOUNT_SYNC_CONTAINMENT_NOTICE } from "@/lib/sync/containment";

const EMAIL_OTP = /^\d{6,8}$/;

interface SignInMethodsProps {
  source: "account" | "onboarding";
  intent?: "create" | "signin";
  onEmailSent?: () => void;
  onUnavailable?: () => void;
  onSignedIn?: () => void;
  nextPath?: string;
}

/** Keeps the canonical enrollment helper available to source-level callers. */
export function shouldCreateAccount(intent: "create" | "signin"): boolean {
  return intent === "create";
}

/** Keeps pasted email codes numeric and within the supported length. */
export function normalizeEmailOtp(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

/** Accepts the same code lengths while the guest UI remains unavailable. */
export function isEmailOtpReady(value: string): boolean {
  return EMAIL_OTP.test(value);
}

/** Renders only the truthful local-device notice in a guest artifact. */
export function SignInMethods(_props: SignInMethodsProps) {
  void _props;
  return (
    <p role="status" className="text-small leading-relaxed text-ash">
      {ACCOUNT_SYNC_CONTAINMENT_NOTICE}
    </p>
  );
}
