import { describe, expect, it } from "vitest";
import {
  authFailureMessage,
  authFailureReason,
  emailOtpFailure,
  emailRequestFailure,
  oauthRequestFailure,
  parseAuthFailureReason,
} from "@/lib/auth/errors";

describe("auth diagnostics", () => {
  it("maps callback failures to bounded, user-safe reasons", () => {
    expect(authFailureReason({ code: "otp_expired" })).toBe("expired");
    expect(authFailureReason({ code: "bad_code_verifier" })).toBe(
      "browser_mismatch",
    );
    expect(authFailureReason(null, "bad_oauth_state")).toBe("provider");
    expect(authFailureReason({ code: "a_future_private_error" })).toBe(
      "unknown",
    );
  });

  it("accepts only the callback reasons the UI understands", () => {
    expect(parseAuthFailureReason("expired")).toBe("expired");
    expect(parseAuthFailureReason("signin")).toBe("unknown");
    expect(parseAuthFailureReason("raw provider detail")).toBeNull();
    expect(parseAuthFailureReason(null)).toBeNull();
  });

  it("gives actionable messages for the built-in sender restriction", () => {
    expect(
      emailRequestFailure({ code: "email_address_not_authorized" }),
    ).toEqual({
      message:
        "Email delivery is not enabled for this address yet. Use Apple or Google for now, or ask the BibleQuest team to finish production email setup.",
      reference: "AUTH-EMAIL-SETUP",
      unavailable: false,
    });
  });

  it("identifies the OAuth provider without exposing provider details", () => {
    expect(
      oauthRequestFailure({ code: "provider_disabled" }, "apple"),
    ).toMatchObject({
      reference: "AUTH-APPLE-DISABLED",
      unavailable: true,
    });
    expect(oauthRequestFailure({ message: "private detail" }, "google")).toEqual({
      message: "We couldn’t open Google sign-in. Please try again.",
      reference: "AUTH-GOOGLE-REQUEST",
      unavailable: false,
    });
  });

  it("distinguishes rate limiting and offline failures", () => {
    expect(
      emailRequestFailure({ code: "over_email_send_rate_limit", status: 429 })
        .reference,
    ).toBe("AUTH-RATE-LIMIT");
    expect(emailRequestFailure(new TypeError("Failed to fetch"), false)).toMatchObject(
      {
        reference: "AUTH-NETWORK",
        unavailable: true,
      },
    );
  });

  it("never blames the connection when the browser reports one", () => {
    // A request that dies locally while the browser is online is usually this
    // app's own service worker declining it, not the visitor's network.
    // Reporting "offline" there sent someone hunting their wifi on 2026-08-15
    // while sign-in had already succeeded at the provider.
    for (const failure of [
      emailRequestFailure(new TypeError("Failed to fetch"), true),
      emailOtpFailure(new TypeError("Failed to fetch"), true),
      emailRequestFailure({ code: "request_timeout" }, true),
      emailOtpFailure({ code: "request_timeout" }, true),
    ]) {
      expect(failure.reference).toBe("AUTH-REQUEST-BLOCKED");
      expect(failure.message).not.toMatch(/offline|reconnect/i);
      // Local continuation stays safe either way.
      expect(failure.unavailable).toBe(true);
    }

    // A browser that actually reports no connection is still told the truth.
    expect(emailOtpFailure(new TypeError("Failed to fetch"), false).reference).toBe(
      "AUTH-NETWORK",
    );
  });

  it("keeps email-code verification failures bounded and actionable", () => {
    expect(emailOtpFailure({ code: "otp_expired" })).toMatchObject({
      reference: "AUTH-CODE-INVALID",
      unavailable: false,
    });
    expect(emailOtpFailure(new TypeError("Failed to fetch"), false)).toMatchObject(
      {
        reference: "AUTH-NETWORK",
        unavailable: true,
      },
    );
  });

  it("never echoes a raw provider message into callback copy", () => {
    const raw = "secret provider implementation detail";
    expect(authFailureMessage(authFailureReason({ message: raw }))).not.toContain(
      raw,
    );
  });
});
