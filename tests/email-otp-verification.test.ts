import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { DeadlineError } from "@/lib/async/deadline";
import { accountLifecycleIsActive } from "@/lib/auth/account-lifecycle";
import {
  beginEmailOtpAttempt,
  cancelEmailOtpAttempt,
  verifyAndInstallEmailOtp,
} from "@/lib/auth/email-otp-verification";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const EMAIL_A = "a@example.com";
const EMAIL_B = "b@example.com";

/** Resolve an SDK-shaped operation at an exact point chosen by the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

/** Build the complete identity fields required by an OTP auth response. */
function user(id: string, email: string): User {
  return {
    id,
    email,
    aud: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-08-11T12:00:00.000Z",
  };
}

/** Build a fresh non-expired session without exposing real credentials. */
function session(id: string, email: string): Session {
  return {
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: user(id, email),
  };
}

/** Return the narrow verifier shape accepted by the production helper. */
function verificationClient(
  verifyOtp: SupabaseClient["auth"]["verifyOtp"],
) {
  return { auth: { verifyOtp } };
}

/** Return the narrow durable installer shape accepted by the production helper. */
function installationClient(
  setSession: SupabaseClient["auth"]["setSession"],
) {
  return { auth: { setSession } };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isolated email OTP verification", () => {
  it("keeps B installed after A times out and resolves late", async () => {
    vi.useFakeTimers();
    const lateA = deferred<
      Awaited<ReturnType<SupabaseClient["auth"]["verifyOtp"]>>
    >();
    const sessionA = session(USER_A, EMAIL_A);
    const sessionB = session(USER_B, EMAIL_B);
    let installedUserId: string | null = null;
    const setSession = vi.fn(async ({ access_token }: { access_token: string }) => {
      installedUserId = access_token === sessionB.access_token ? USER_B : USER_A;
      const installed = installedUserId === USER_B ? sessionB : sessionA;
      return { data: { session: installed, user: installed.user }, error: null };
    }) as SupabaseClient["auth"]["setSession"];
    const installer = installationClient(setSession);

    const attemptA = beginEmailOtpAttempt(EMAIL_A);
    const timedOutA = verifyAndInstallEmailOtp(
      attemptA,
      "111111",
      () => EMAIL_A,
      {
        verificationClient: verificationClient(
          vi.fn(() => lateA.promise) as SupabaseClient["auth"]["verifyOtp"],
        ),
        installationClient: installer,
        timeoutMs: 50,
      },
    );
    const timeoutAssertion = expect(timedOutA).rejects.toBeInstanceOf(
      DeadlineError,
    );
    await vi.advanceTimersByTimeAsync(50);
    await timeoutAssertion;
    cancelEmailOtpAttempt(attemptA);

    const attemptB = beginEmailOtpAttempt(EMAIL_B);
    await expect(
      verifyAndInstallEmailOtp(attemptB, "222222", () => EMAIL_B, {
        verificationClient: verificationClient(
          vi.fn(async () => ({
            data: { session: sessionB, user: sessionB.user },
            error: null,
          })) as SupabaseClient["auth"]["verifyOtp"],
        ),
        installationClient: installer,
        timeoutMs: 50,
      }),
    ).resolves.toEqual({ status: "installed" });
    cancelEmailOtpAttempt(attemptB);
    expect(installedUserId).toBe(USER_B);

    lateA.resolve({
      data: { session: sessionA, user: sessionA.user },
      error: null,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(installedUserId).toBe(USER_B);
    expect(setSession).toHaveBeenCalledOnce();
    expect(setSession).toHaveBeenCalledWith({
      access_token: sessionB.access_token,
      refresh_token: sessionB.refresh_token,
    });
  });

  it("does not install a result after the requested email changes", async () => {
    const sessionA = session(USER_A, EMAIL_A);
    const setSession = vi.fn() as SupabaseClient["auth"]["setSession"];
    const attempt = beginEmailOtpAttempt(EMAIL_A);

    await expect(
      verifyAndInstallEmailOtp(attempt, "111111", () => EMAIL_B, {
        verificationClient: verificationClient(
          vi.fn(async () => ({
            data: { session: sessionA, user: sessionA.user },
            error: null,
          })) as SupabaseClient["auth"]["verifyOtp"],
        ),
        installationClient: installationClient(setSession),
      }),
    ).resolves.toEqual({ status: "stale" });
    cancelEmailOtpAttempt(attempt);

    expect(setSession).not.toHaveBeenCalled();
  });

  it("holds the lifecycle after install timeout until late A is removed", async () => {
    vi.useFakeTimers();
    const sessionA = session(USER_A, EMAIL_A);
    const lateInstall = deferred<
      Awaited<ReturnType<SupabaseClient["auth"]["setSession"]>>
    >();
    const cleanupStarted = deferred<void>();
    const setSessionMock = vi.fn(() => lateInstall.promise);
    const setSession =
      setSessionMock as SupabaseClient["auth"]["setSession"];
    const clearInstalledSession = vi.fn(async () => {
      cleanupStarted.resolve();
      return "cleared" as const;
    });
    const attempt = beginEmailOtpAttempt(EMAIL_A);
    const pending = verifyAndInstallEmailOtp(
      attempt,
      "111111",
      () => EMAIL_A,
      {
        verificationClient: verificationClient(
          vi.fn(async () => ({
            data: { session: sessionA, user: sessionA.user },
            error: null,
          })) as SupabaseClient["auth"]["verifyOtp"],
        ),
        installationClient: installationClient(setSession),
        clearInstalledSession,
        installationTimeoutMs: 50,
      },
    );
    while (!setSessionMock.mock.calls.length) await Promise.resolve();
    expect(accountLifecycleIsActive()).toBe(true);

    const timeoutAssertion = expect(pending).rejects.toBeInstanceOf(
      DeadlineError,
    );
    await vi.advanceTimersByTimeAsync(50);
    await timeoutAssertion;
    cancelEmailOtpAttempt(attempt);
    expect(accountLifecycleIsActive()).toBe(true);
    expect(clearInstalledSession).not.toHaveBeenCalled();

    lateInstall.resolve({
      data: { session: sessionA, user: sessionA.user },
      error: null,
    });
    await cleanupStarted.promise;
    while (accountLifecycleIsActive()) await Promise.resolve();

    expect(clearInstalledSession).toHaveBeenCalledWith({
      userId: USER_A,
      accessToken: sessionA.access_token,
      refreshToken: sessionA.refresh_token,
    });
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("removes a completed install when cancellation happens during setSession", async () => {
    const sessionA = session(USER_A, EMAIL_A);
    const lateInstall = deferred<
      Awaited<ReturnType<SupabaseClient["auth"]["setSession"]>>
    >();
    const setSessionMock = vi.fn(() => lateInstall.promise);
    const setSession =
      setSessionMock as SupabaseClient["auth"]["setSession"];
    const clearInstalledSession = vi.fn(async () => "cleared" as const);
    let currentEmail = EMAIL_A;
    const attempt = beginEmailOtpAttempt(EMAIL_A);
    const pending = verifyAndInstallEmailOtp(
      attempt,
      "111111",
      () => currentEmail,
      {
        verificationClient: verificationClient(
          vi.fn(async () => ({
            data: { session: sessionA, user: sessionA.user },
            error: null,
          })) as SupabaseClient["auth"]["verifyOtp"],
        ),
        installationClient: installationClient(setSession),
        clearInstalledSession,
        installationTimeoutMs: 1_000,
      },
    );
    while (!setSessionMock.mock.calls.length) await Promise.resolve();

    currentEmail = "";
    cancelEmailOtpAttempt(attempt);
    lateInstall.resolve({
      data: { session: sessionA, user: sessionA.user },
      error: null,
    });

    await expect(pending).resolves.toEqual({ status: "stale" });
    expect(clearInstalledSession).toHaveBeenCalledWith({
      userId: USER_A,
      accessToken: sessionA.access_token,
      refreshToken: sessionA.refresh_token,
    });
    expect(accountLifecycleIsActive()).toBe(false);
  });
});
