import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountSignOutError,
  signOutExpectedAccount,
} from "@/lib/auth/account-sign-out";
import {
  accountLifecycleIsActive,
  beginAccountLifecycle,
} from "@/lib/auth/account-lifecycle";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";

function authClient(userId = USER_A) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: "access-a",
            refresh_token: "refresh-a",
            user: { id: userId },
          },
        },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      startAutoRefresh: vi.fn().mockResolvedValue(undefined),
      stopAutoRefresh: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function revocationClient(result: { error: unknown } = { error: null }) {
  return {
    auth: {
      admin: {
        signOut: vi.fn().mockResolvedValue(result),
      },
    },
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_PLATFORM", "native");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("safe native account sign-out", () => {
  it("revokes off-storage before clearing only the captured credential", async () => {
    const owner = authClient();
    const revocation = revocationClient();
    const clearSession = vi.fn(async () => {
      expect(accountLifecycleIsActive()).toBe(true);
      expect(beginAccountLifecycle(USER_B)).toBeNull();
      return "cleared" as const;
    });
    const journey = { prayers: ["device-only fixture"] };

    await expect(
      signOutExpectedAccount(USER_A, {
        authClient: owner,
        clearSession,
        revocationClient: revocation,
      }),
    ).resolves.toEqual({ status: "signed-out", reloadRequired: true });

    expect(owner.auth.stopAutoRefresh).toHaveBeenCalledOnce();
    expect(revocation.auth.admin.signOut).toHaveBeenCalledWith(
      "access-a",
      "global",
    );
    expect(clearSession).toHaveBeenCalledWith({
      userId: USER_A,
      accessToken: "access-a",
      refreshToken: "refresh-a",
    });
    expect(owner.auth.signOut).not.toHaveBeenCalled();
    expect(owner.auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(journey).toEqual({ prayers: ["device-only fixture"] });
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("retains the exact local credential and journey when revoke fails", async () => {
    const owner = authClient();
    const revocation = revocationClient({ error: new Error("offline") });
    const clearSession = vi.fn();
    const credential = {
      userId: USER_A,
      accessToken: "access-a",
      refreshToken: "refresh-a",
    };
    const journey = { owner: USER_A, progress: 7 };

    await expect(
      signOutExpectedAccount(USER_A, {
        authClient: owner,
        clearSession,
        revocationClient: revocation,
      }),
    ).rejects.toMatchObject({
      name: "AccountSignOutError",
      reloadRequired: false,
    });

    expect(clearSession).not.toHaveBeenCalled();
    expect(owner.auth.signOut).not.toHaveBeenCalled();
    expect(owner.auth.startAutoRefresh).toHaveBeenCalledOnce();
    expect(credential).toEqual({
      userId: USER_A,
      accessToken: "access-a",
      refreshToken: "refresh-a",
    });
    expect(journey).toEqual({ owner: USER_A, progress: 7 });
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("bounds a hung revoke without giving it access to native storage", async () => {
    vi.useFakeTimers();
    const owner = authClient();
    const revocation = {
      auth: {
        admin: {
          signOut: vi.fn(() => new Promise<{ error: unknown }>(() => {})),
        },
      },
    };
    const clearSession = vi.fn();
    const signingOut = signOutExpectedAccount(USER_A, {
      authClient: owner,
      clearSession,
      deadlineMs: 25,
      revocationClient: revocation,
    });
    const rejected = expect(signingOut).rejects.toBeInstanceOf(
      AccountSignOutError,
    );

    await vi.advanceTimersByTimeAsync(25);

    await rejected;
    expect(clearSession).not.toHaveBeenCalled();
    expect(owner.auth.signOut).not.toHaveBeenCalled();
    expect(owner.auth.startAutoRefresh).toHaveBeenCalledOnce();
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("preserves a newer B credential and requires a clean reload", async () => {
    const owner = authClient();
    const revocation = revocationClient();
    let persistedOwner = USER_B;
    const clearSession = vi.fn(async () => {
      persistedOwner = USER_B;
      return "different-session" as const;
    });

    await expect(
      signOutExpectedAccount(USER_A, {
        authClient: owner,
        clearSession,
        revocationClient: revocation,
      }),
    ).resolves.toEqual({
      status: "session-changed",
      reloadRequired: true,
    });

    expect(persistedOwner).toBe(USER_B);
    expect(owner.auth.signOut).not.toHaveBeenCalled();
    expect(owner.auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("refuses an unexpected B session before any remote mutation", async () => {
    const owner = authClient(USER_B);
    const revocation = revocationClient();
    const clearSession = vi.fn();

    await expect(
      signOutExpectedAccount(USER_A, {
        authClient: owner,
        clearSession,
        revocationClient: revocation,
      }),
    ).rejects.toBeInstanceOf(AccountSignOutError);

    expect(revocation.auth.admin.signOut).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
    expect(owner.auth.startAutoRefresh).toHaveBeenCalledOnce();
    expect(accountLifecycleIsActive()).toBe(false);
  });
});
