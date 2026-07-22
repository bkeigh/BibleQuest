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
});
