/**
 * Installing a verified session flips `useSession().loading`, which swaps the
 * sign-in form off screen while `verifyAndInstallEmailOtp` is still running.
 * On 2026-08-15 that unmount cancelled the in-flight attempt and blanked the
 * requested address, so `installationMatchesAttempt` reported a perfect match
 * against an attempt that was no longer "current" — and the installer deleted
 * the credential it had just written. Sign-in returned `stale`, which the UI
 * renders as nothing at all, so it looked like the code simply never worked.
 *
 * The server had already recorded the sign-in. Only the device discarded it.
 *
 * SCOPE — read before trusting these as coverage. They pin the semantics of
 * `emailOtpAttemptIsCurrent`: which conditions retire an attempt, and that a
 * genuinely changed address still refuses. They do **not** reproduce the
 * regression, which lives in `SignInMethods`' unmount cleanup. Reverting that
 * fix leaves every case here green — verified by mutation on 2026-08-15.
 *
 * Catching the real thing needs a DOM test environment (this suite runs
 * `environment: "node"` with no testing library), so the component's unmount
 * behaviour is currently proved only on a device. That gap is tracked
 * separately; do not read a green run here as protection against a repeat.
 */
import { describe, expect, it } from "vitest";
import {
  beginEmailOtpAttempt,
  cancelEmailOtpAttempt,
  emailOtpAttemptIsCurrent,
} from "@/lib/auth/email-otp-verification";

const ADDRESS = "someone@example.com";

describe("email OTP attempt currency", () => {
  it("stays current across an unmount that does not cancel the attempt", () => {
    const attempt = beginEmailOtpAttempt(ADDRESS);

    // The form unmounts mid-verify. With the fix it neither cancels the
    // attempt nor blanks the address, so the installer still sees its own
    // attempt as current and keeps the session it just installed.
    expect(emailOtpAttemptIsCurrent(attempt, ADDRESS)).toBe(true);
  });

  it("treats a blanked address as no longer current", () => {
    const attempt = beginEmailOtpAttempt(ADDRESS);

    // This is precisely what the old unmount cleanup did via
    // `requestedEmailRef.current = ""`.
    expect(emailOtpAttemptIsCurrent(attempt, "")).toBe(false);
  });

  it("treats an explicit cancellation as no longer current", () => {
    const attempt = beginEmailOtpAttempt(ADDRESS);
    cancelEmailOtpAttempt(attempt);

    expect(emailOtpAttemptIsCurrent(attempt, ADDRESS)).toBe(false);
  });

  it("keeps a genuinely changed address from installing the old session", () => {
    const attempt = beginEmailOtpAttempt(ADDRESS);

    // The guard this whole mechanism exists for must survive the fix.
    expect(emailOtpAttemptIsCurrent(attempt, "other@example.com")).toBe(false);
  });

  it("retires an earlier attempt once a newer one begins", () => {
    const first = beginEmailOtpAttempt(ADDRESS);
    const second = beginEmailOtpAttempt(ADDRESS);

    expect(emailOtpAttemptIsCurrent(first, ADDRESS)).toBe(false);
    expect(emailOtpAttemptIsCurrent(second, ADDRESS)).toBe(true);
  });

  it("ignores address casing and surrounding whitespace", () => {
    const attempt = beginEmailOtpAttempt(ADDRESS);

    expect(emailOtpAttemptIsCurrent(attempt, `  ${ADDRESS.toUpperCase()} `)).toBe(
      true,
    );
  });
});
