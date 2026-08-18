import { describe, expect, it, vi } from "vitest";
import {
  SIGN_IN_TRACKING_STAMP_KEY,
  clearSignInTrackingStamp,
} from "@/lib/auth/sign-in-tracking";

/** Installs the exact localStorage surface used by the analytics stamp. */
function installStamp(value: string) {
  const values = new Map([[SIGN_IN_TRACKING_STAMP_KEY, value]]);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    },
  });
  return values;
}

describe("deleted-account sign-in tracking residue", () => {
  it("stores no account identifier and removes the terminal timestamp", () => {
    const values = installStamp("123");

    expect([...values.values()].join("|")).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f-]{27}/i,
    );
    expect(clearSignInTrackingStamp()).toBe(true);
    expect(values.has(SIGN_IN_TRACKING_STAMP_KEY)).toBe(false);
  });
});
