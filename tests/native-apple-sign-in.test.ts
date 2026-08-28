import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { accountLifecycleIsActive } from "@/lib/auth/account-lifecycle";
import {
  NativeAppleInstallationRecoveryError,
  nativeAppleSignInWasCancelled,
  signInWithNativeApple,
} from "@/lib/auth/native-apple-sign-in";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";

/** Builds the complete identity fields required by the provider exchange. */
function user(id: string): User {
  return {
    id,
    email: "private-relay@example.com",
    aud: "authenticated",
    app_metadata: { provider: "apple" },
    user_metadata: {},
    created_at: "2026-08-27T12:00:00.000Z",
  };
}

/** Builds a complete storage-free provider session for one fixture identity. */
function session(id: string): Session {
  return {
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: user(id),
  };
}

/** Returns the narrow token client accepted by the production helper. */
function tokenClient(
  signInWithIdToken: SupabaseClient["auth"]["signInWithIdToken"],
) {
  return { auth: { signInWithIdToken } };
}

/** Returns the narrow Keychain installer accepted by the production helper. */
function installationClient(
  getSession: SupabaseClient["auth"]["getSession"],
  setSession: SupabaseClient["auth"]["setSession"],
) {
  return { auth: { getSession, setSession } };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_PLATFORM", "native");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("native Sign in with Apple", () => {
  it("exchanges only the nonce-bound token and installs the exact identity", async () => {
    const providerSession = session(USER_A);
    const authorize = vi.fn(async () => ({
      identityToken: "fixture.apple.identity.token",
      nonce: "fixture-nonce-with-enough-entropy",
    }));
    const signInWithIdToken = vi.fn(async () => ({
      data: { session: providerSession, user: providerSession.user },
      error: null,
    })) as SupabaseClient["auth"]["signInWithIdToken"];
    const getSession = vi.fn(async () => ({
      data: { session: null },
      error: null,
    })) as SupabaseClient["auth"]["getSession"];
    const setSession = vi.fn(async () => ({
      data: { session: providerSession, user: providerSession.user },
      error: null,
    })) as SupabaseClient["auth"]["setSession"];

    await expect(
      signInWithNativeApple({
        applePlugin: { authorize },
        tokenClient: tokenClient(signInWithIdToken),
        installationClient: installationClient(getSession, setSession),
      }),
    ).resolves.toBeUndefined();

    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: "apple",
      token: "fixture.apple.identity.token",
      nonce: "fixture-nonce-with-enough-entropy",
    });
    expect(setSession).toHaveBeenCalledWith({
      access_token: providerSession.access_token,
      refresh_token: providerSession.refresh_token,
    });
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("never replaces a different account already saved on the phone", async () => {
    const providerSession = session(USER_A);
    const otherSession = session(USER_B);
    const setSession = vi.fn() as SupabaseClient["auth"]["setSession"];

    await expect(
      signInWithNativeApple({
        applePlugin: {
          authorize: async () => ({
            identityToken: "fixture.apple.identity.token",
            nonce: "fixture-nonce-with-enough-entropy",
          }),
        },
        tokenClient: tokenClient(
          vi.fn(async () => ({
            data: { session: providerSession, user: providerSession.user },
            error: null,
          })) as SupabaseClient["auth"]["signInWithIdToken"],
        ),
        installationClient: installationClient(
          vi.fn(async () => ({
            data: { session: otherSession },
            error: null,
          })) as SupabaseClient["auth"]["getSession"],
          setSession,
        ),
      }),
    ).rejects.toThrow("account changed");

    expect(setSession).not.toHaveBeenCalled();
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("holds the lifecycle until an ambiguous late Keychain write settles", async () => {
    vi.useFakeTimers();
    const providerSession = session(USER_A);
    let resolveInstall!: (
      value: Awaited<ReturnType<SupabaseClient["auth"]["setSession"]>>,
    ) => void;
    const installation = new Promise<
      Awaited<ReturnType<SupabaseClient["auth"]["setSession"]>>
    >((resolve) => {
      resolveInstall = resolve;
    });
    const pending = signInWithNativeApple({
      applePlugin: {
        authorize: async () => ({
          identityToken: "fixture.apple.identity.token",
          nonce: "fixture-nonce-with-enough-entropy",
        }),
      },
      tokenClient: tokenClient(
        vi.fn(async () => ({
          data: { session: providerSession, user: providerSession.user },
          error: null,
        })) as SupabaseClient["auth"]["signInWithIdToken"],
      ),
      installationClient: installationClient(
        vi.fn(async () => ({ data: { session: null }, error: null })) as
          SupabaseClient["auth"]["getSession"],
        vi.fn(() => installation) as SupabaseClient["auth"]["setSession"],
      ),
      installationTimeoutMs: 50,
    });

    const timeoutAssertion = expect(pending).rejects.toBeInstanceOf(
      NativeAppleInstallationRecoveryError,
    );
    await vi.advanceTimersByTimeAsync(50);
    await timeoutAssertion;
    expect(accountLifecycleIsActive()).toBe(true);

    resolveInstall({
      data: { session: providerSession, user: providerSession.user },
      error: null,
    });
    await vi.waitFor(() => expect(accountLifecycleIsActive()).toBe(false));
  });

  it("recognizes only the native cancellation code as a quiet dismissal", () => {
    expect(
      nativeAppleSignInWasCancelled({ code: "APPLE_SIGN_IN_CANCELLED" }),
    ).toBe(true);
    expect(nativeAppleSignInWasCancelled(new Error("cancelled"))).toBe(false);
  });
});
