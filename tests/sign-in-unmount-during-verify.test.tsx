// @vitest-environment jsdom
/**
 * The regression that shipped on 2026-08-15 and could not be caught here.
 *
 * Installing a verified session flips `useSession().loading`, which swaps the
 * sign-in form off screen while `verifyAndInstallEmailOtp` is still running.
 * The form's unmount cleanup cancelled the in-flight attempt and blanked the
 * requested address — both of which retire an attempt — so the installer read
 * its own success as the person changing their mind and deleted the credential
 * it had just written. Sign-in silently did nothing while the server had
 * already recorded the sign-in.
 *
 * `tests/email-otp-unmount-during-install.test.ts` pins the helper semantics
 * but stays green when the fix is reverted, because it never mounts anything.
 * This case mounts the real component and unmounts it mid-verification, so it
 * fails when the fix is removed.
 *
 * The attempt bookkeeping is deliberately NOT mocked — it is the state the bug
 * corrupted. Only the verification call is stubbed, so its timing is ours.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EmailOtpAttempt } from "@/lib/auth/email-otp-verification";

const ADDRESS = "someone@example.com";
const CODE = "123456";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOAuth: vi.fn() } }),
}));

vi.mock("@/lib/sync/availability", () => ({
  requireNativeAccountBetaAvailability: () => Promise.resolve(),
}));

vi.mock("@/lib/analytics/events", () => ({ track: vi.fn() }));

// Without this the component renders its containment notice instead of a form,
// because the account latch is unset in the test environment.
vi.mock("@/lib/sync/containment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync/containment")>();
  return {
    ...actual,
    ACCOUNT_SYNC_CONTAINED: false,
    NATIVE_ACCOUNT_BETA_ENABLED: false,
  };
});

vi.mock("@/lib/observability/client-signals", () => ({
  reportClientSignal: vi.fn(),
  classifyOperationalError: () => "unknown",
}));

vi.mock("@/lib/supabase/web-auth-storage", () => ({
  readWebAuthState: () => Promise.resolve({ status: "missing" }),
  requireCurrentWebAccountRealm: () => Promise.resolve(),
  withWebAccountOperationLock: (run: (handle: unknown) => unknown) => run({}),
}));

/** Captures the live attempt and hands back a promise this test resolves. */
const verification = {
  attempt: null as EmailOtpAttempt | null,
  currentEmail: null as (() => string) | null,
  release: null as ((value: { status: "installed" }) => void) | null,
};

vi.mock("@/lib/auth/email-otp-verification", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/auth/email-otp-verification")
  >();
  return {
    ...actual,
    requestIsolatedEmailOtp: () => Promise.resolve({ error: null }),
    verifyAndInstallEmailOtp: (
      attempt: EmailOtpAttempt,
      _token: string,
      currentEmail: () => string,
    ) => {
      verification.attempt = attempt;
      verification.currentEmail = currentEmail;
      return new Promise((resolve) => {
        verification.release = resolve as typeof verification.release;
      });
    },
  };
});

afterEach(() => {
  cleanup();
  verification.attempt = null;
  verification.currentEmail = null;
  verification.release = null;
});

/** Drives the form to the point where a verification is in flight. */
async function startVerification() {
  const { SignInMethods } = await import(
    "@/components/account/SignInMethods"
  );
  const { emailOtpAttemptIsCurrent } = await import(
    "@/lib/auth/email-otp-verification"
  );
  const view = render(<SignInMethods source="account" intent="signin" />);

  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: ADDRESS },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign-in code/i }));

  const codeField = await screen.findByLabelText("Sign-in code");
  fireEvent.change(codeField, { target: { value: CODE } });

  await waitFor(() => expect(verification.attempt).not.toBeNull());
  return { view, emailOtpAttemptIsCurrent };
}

describe("unmounting the sign-in form mid-verification", () => {
  it("accepts a formatted six-digit paste and submits it immediately", async () => {
    const { SignInMethods } = await import(
      "@/components/account/SignInMethods"
    );
    const view = render(<SignInMethods source="account" intent="signin" />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: ADDRESS },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign-in code/i }));
    const codeField = await screen.findByLabelText("Sign-in code");

    expect(codeField.getAttribute("autocomplete")).toBe("one-time-code");
    expect(codeField.getAttribute("maxlength")).toBe("6");
    fireEvent.paste(codeField, {
      clipboardData: { getData: () => "123 456" },
    });

    await waitFor(() => expect(verification.attempt).not.toBeNull());
    expect((codeField as HTMLInputElement).value).toBe(CODE);
    view.unmount();
  });

  it("leaves the in-flight attempt current so the session survives", async () => {
    const { view, emailOtpAttemptIsCurrent } = await startVerification();
    const attempt = verification.attempt!;

    // Exactly what installing a session does: the form leaves the screen.
    view.unmount();

    // The installer asks this immediately after setSession. If the unmount
    // retired the attempt, it compare-clears the credential it just wrote.
    expect(emailOtpAttemptIsCurrent(attempt, ADDRESS)).toBe(true);
    expect(verification.currentEmail?.()).toBe(ADDRESS);
  });

  it("still refuses once the address genuinely changes", async () => {
    const { view, emailOtpAttemptIsCurrent } = await startVerification();
    const attempt = verification.attempt!;
    view.unmount();

    // The guard this mechanism exists for has to survive the fix.
    expect(emailOtpAttemptIsCurrent(attempt, "someone-else@example.com")).toBe(
      false,
    );
  });
});
