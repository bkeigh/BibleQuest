import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Preserve coverage for the enrollment UI that returns after containment.
vi.mock("@/lib/sync/containment", () => ({
  ACCOUNT_SYNC_CONTAINED: false,
  accountSyncAvailable: (configured: boolean) => configured,
}));

import {
  isEmailOtpReady,
  normalizeEmailOtp,
  SignInMethods,
  shouldCreateAccount,
} from "@/components/account/SignInMethods";

describe("production sign-in methods", () => {
  it("offers email, Apple, and Google without advertising disabled phone auth", () => {
    const markup = renderToStaticMarkup(
      createElement(SignInMethods, { source: "account" }),
    );

    expect(markup).toContain("Email me a sign-in code");
    expect(markup).toContain("Sign in with Apple");
    expect(markup).toContain("Sign in with Google");
    expect(markup).toContain('data-provider-button="apple"');
    expect(markup).toContain('data-provider-mark="apple"');
    expect(markup).toContain('data-provider-button="google"');
    expect(markup).toContain('data-provider-mark="google"');
    expect(markup).not.toContain("Text me a code");
    expect(markup).not.toContain('type="tel"');
  });

  it("labels first-run account creation separately from returning sign-in", () => {
    const createMarkup = renderToStaticMarkup(
      createElement(SignInMethods, {
        source: "onboarding",
        intent: "create",
      }),
    );
    const signInMarkup = renderToStaticMarkup(
      createElement(SignInMethods, {
        source: "onboarding",
        intent: "signin",
      }),
    );

    expect(createMarkup).toContain("Create account with email");
    expect(createMarkup).toContain("Sign in with Apple");
    expect(createMarkup).toContain("Sign in with Google");
    expect(signInMarkup).toContain("Email me a sign-in code");
    expect(signInMarkup).toContain("Sign in with Apple");
    expect(signInMarkup).toContain("Sign in with Google");
  });

  it("allows email identity creation only from explicit create mode", () => {
    expect(shouldCreateAccount("create")).toBe(true);
    expect(shouldCreateAccount("signin")).toBe(false);
  });

  it("normalizes current Supabase email-code lengths", () => {
    expect(normalizeEmailOtp(" 12-34 56 ")).toBe("123456");
    expect(normalizeEmailOtp("123456789")).toBe("12345678");
    expect(isEmailOtpReady("123456")).toBe(true);
    expect(isEmailOtpReady("12345678")).toBe(true);
    expect(isEmailOtpReady("12345")).toBe(false);
    expect(isEmailOtpReady("12345a")).toBe(false);
  });
});
