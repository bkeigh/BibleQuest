import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Preserve coverage for the enrollment UI that returns after containment.
vi.mock("@/lib/sync/containment", () => ({
  ACCOUNT_SYNC_CONTAINED: false,
  accountSyncAvailable: (configured: boolean) => configured,
}));

import { SignInMethods } from "@/components/account/SignInMethods";

describe("production sign-in methods", () => {
  it("offers email and Google without advertising disabled phone auth", () => {
    const markup = renderToStaticMarkup(
      createElement(SignInMethods, { source: "account" }),
    );

    expect(markup).toContain("Email me a sign-in link");
    expect(markup).toContain("Continue with Google");
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
    expect(createMarkup).toContain("Create account with Google");
    expect(signInMarkup).toContain("Email me a sign-in link");
    expect(signInMarkup).toContain("Continue with Google");
  });
});
