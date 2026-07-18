import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEXT,
  authCallbackPath,
  safeNextPath,
} from "@/lib/auth/redirect";

describe("auth callback redirect validation", () => {
  it.each([
    "/app",
    "/app/prayer",
    "/app/prayer?filter=answered#latest",
    "/app/%E2%9C%93",
    "/onboarding",
  ])("accepts an internal target: %s", (target) => {
    expect(safeNextPath(target)).toBe(target);
  });

  it.each([
    null,
    "",
    "app",
    "https://attacker.test/path",
    "javascript:alert(1)",
    "//attacker.test/path",
    "/\\attacker.test/path",
    "/%5cattacker.test/path",
    "/\u0000/app",
    "/app\n//attacker.test",
    "/%00/app",
    "/app/%",
    "/app/%E0%A4%A",
  ])("rejects an unsafe or malformed target", (target) => {
    expect(safeNextPath(target)).toBe(DEFAULT_NEXT);
  });

  it("carries a safe returning-user destination through the callback", () => {
    expect(authCallbackPath("/onboarding")).toBe(
      "/auth/callback?next=%2Fonboarding"
    );
    expect(authCallbackPath("//attacker.test/steal")).toBe(
      "/auth/callback?next=%2Fapp"
    );
  });
});
