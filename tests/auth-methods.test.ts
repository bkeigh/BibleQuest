import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignInMethods } from "@/components/account/SignInMethods";

describe("production sign-in methods", () => {
  it("offers email and Google without advertising disabled phone auth", () => {
    const markup = renderToStaticMarkup(
      createElement(SignInMethods, { source: "account" }),
    );

    expect(markup).toContain("Send a sign-in link");
    expect(markup).toContain("Continue with Google");
    expect(markup).not.toContain("Text me a code");
    expect(markup).not.toContain('type="tel"');
  });
});
