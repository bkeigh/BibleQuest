import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_COMPLETION_COOKIE,
  authEventCompletesSignIn,
  consumeAuthCompletionSignal,
} from "@/lib/auth/completion-signal";

describe("auth callback completion signal", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
  });

  it("counts callback INITIAL_SESSION and in-page SIGNED_IN", () => {
    expect(authEventCompletesSignIn("INITIAL_SESSION", true)).toBe(true);
    expect(authEventCompletesSignIn("INITIAL_SESSION", false)).toBe(false);
    expect(authEventCompletesSignIn("SIGNED_IN", false)).toBe(true);
    expect(authEventCompletesSignIn("TOKEN_REFRESHED", true)).toBe(false);
  });

  it("consumes only the bounded callback cookie", () => {
    document.cookie = `another=value; ${AUTH_COMPLETION_COOKIE}=1`;

    expect(consumeAuthCompletionSignal()).toBe(true);
    expect(document.cookie).toContain(`${AUTH_COMPLETION_COOKIE}=`);
    expect(document.cookie).toContain("Max-Age=0");
  });

  it("ignores unrelated cookie values", () => {
    document.cookie = `${AUTH_COMPLETION_COOKIE}=unexpected; another=value`;
    expect(consumeAuthCompletionSignal()).toBe(false);
  });
});
