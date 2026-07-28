import { describe, expect, it } from "vitest";
import {
  grantOperatorPlusInput,
  isOperatorPlusDuration,
  revokeOperatorPlusInput,
} from "@/lib/console/plus-grants";

/** Builds browser-equivalent form data for server validation tests. */
function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("console Plus grant validation", () => {
  it("accepts only exact email confirmation and bounded durations", () => {
    expect(isOperatorPlusDuration("30d")).toBe(true);
    expect(isOperatorPlusDuration("custom")).toBe(false);
    expect(
      grantOperatorPlusInput(
        form({
          email: " Member@Example.com ",
          confirmation: "member@example.com",
          duration: "30d",
          reason: "Approved QA access.",
        }),
      ),
    ).toEqual({
      email: "member@example.com",
      confirmation: "member@example.com",
      duration: "30d",
      reason: "Approved QA access.",
    });
    expect(
      grantOperatorPlusInput(
        form({
          email: "member@example.com",
          confirmation: "other@example.com",
          duration: "30d",
          reason: "Approved QA access.",
        }),
      ),
    ).toBeNull();
    expect(
      grantOperatorPlusInput(
        form({
          email: "member@example.com",
          confirmation: "member@example.com",
          duration: "forever",
          reason: "Approved QA access.",
        }),
      ),
    ).toBeNull();
  });

  it("binds revocation to one UUID, email, and explicit reason", () => {
    expect(
      revokeOperatorPlusInput(
        form({
          userId: "d2000000-0000-4000-8000-000000000002",
          email: "member@example.com",
          confirmation: "member@example.com",
          reason: "QA access completed.",
        }),
      ),
    ).toEqual({
      userId: "d2000000-0000-4000-8000-000000000002",
      email: "member@example.com",
      confirmation: "member@example.com",
      reason: "QA access completed.",
    });
    expect(
      revokeOperatorPlusInput(
        form({
          userId: "../../other-user",
          email: "member@example.com",
          confirmation: "member@example.com",
          reason: "QA access completed.",
        }),
      ),
    ).toBeNull();
  });

  it("rejects control characters and unbounded reasons", () => {
    expect(
      grantOperatorPlusInput(
        form({
          email: "member@example.com",
          confirmation: "member@example.com",
          duration: "7d",
          reason: "bad\nreason",
        }),
      ),
    ).toBeNull();
    expect(
      grantOperatorPlusInput(
        form({
          email: "member@example.com",
          confirmation: "member@example.com",
          duration: "7d",
          reason: "x".repeat(241),
        }),
      ),
    ).toBeNull();
  });
});
