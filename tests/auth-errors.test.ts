import { describe, expect, it } from "vitest";
import {
  authFailureMessage,
  authFailureReason,
  emailRequestFailure,
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
        "Email delivery is not enabled for this address yet. Use Google for now, or ask the BibleQuest team to finish production email setup.",
      reference: "AUTH-EMAIL-SETUP",
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

  it("never echoes a raw provider message into callback copy", () => {
    const raw = "secret provider implementation detail";
    expect(authFailureMessage(authFailureReason({ message: raw }))).not.toContain(
      raw,
    );
  });
});
