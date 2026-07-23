import { describe, expect, it } from "vitest";
import {
  authEventRequiresUserVerification,
  decideSessionVerification,
  observedSessionBoundary,
} from "@/lib/supabase/session-verification";

describe("Supabase session verification", () => {
  it("keeps cached INITIAL_SESSION and refocus events provisional", () => {
    expect(authEventRequiresUserVerification("INITIAL_SESSION")).toBe(true);
    expect(authEventRequiresUserVerification("SIGNED_IN")).toBe(true);
    expect(authEventRequiresUserVerification("TOKEN_REFRESHED")).toBe(true);
    expect(authEventRequiresUserVerification("SIGNED_OUT")).toBe(false);
  });

  it("accepts only a remotely verified user", () => {
    expect(decideSessionVerification(true, null)).toBe("accept");
  });

  it("isolates a new account while preserving a same-account retry", () => {
    expect(observedSessionBoundary("user-a", "user-a")).toEqual({
      isolateUntilVerified: false,
      preserveVerifiedUserOnRetryableFailure: true,
    });
    expect(observedSessionBoundary("user-a", "user-b")).toEqual({
      isolateUntilVerified: true,
      preserveVerifiedUserOnRetryableFailure: false,
    });
    expect(observedSessionBoundary(null, "user-b")).toEqual({
      isolateUntilVerified: true,
      preserveVerifiedUserOnRetryableFailure: false,
    });
  });

  it("clears deleted, missing, and invalid local sessions", () => {
    expect(
      decideSessionVerification(false, {
        status: 403,
        code: "user_not_found",
      }),
    ).toBe("clear-local-auth");
    expect(
      decideSessionVerification(false, {
        name: "AuthSessionMissingError",
        status: 400,
      }),
    ).toBe("clear-local-auth");
    expect(decideSessionVerification(false, null)).toBe("clear-local-auth");
  });

  it("preserves local state during offline, timeout, and server failures", () => {
    expect(
      decideSessionVerification(false, {
        name: "TypeError",
        message: "Failed to fetch",
      }),
    ).toBe("preserve-local-state");
    expect(
      decideSessionVerification(false, {
        code: "request_timeout",
      }),
    ).toBe("preserve-local-state");
    expect(
      decideSessionVerification(false, {
        status: 503,
      }),
    ).toBe("preserve-local-state");
  });

  it("keeps user A isolated through user B timeout and terminal deletion", () => {
    const userBScope = observedSessionBoundary("user-a", "user-b");
    expect(userBScope.isolateUntilVerified).toBe(true);
    expect(userBScope.preserveVerifiedUserOnRetryableFailure).toBe(false);

    expect(
      decideSessionVerification(false, { code: "request_timeout" }),
    ).toBe("preserve-local-state");
    expect(
      decideSessionVerification(false, {
        status: 403,
        code: "user_not_found",
      }),
    ).toBe("clear-local-auth");
  });
});
