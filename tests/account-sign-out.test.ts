import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

vi.mock("@/lib/platform/web-auth-service-worker", () => ({
  requireWebAuthServiceWorkerAttestation: vi.fn().mockResolvedValue(undefined),
}));
import {
  AccountSignOutError,
  signOutExpectedAccount,
} from "@/lib/auth/account-sign-out";
import {
  accountLifecycleIsActive,
  beginAccountLifecycle,
} from "@/lib/auth/account-lifecycle";
import { withWebAccountOperationLock } from "@/lib/supabase/web-auth-storage";
import {
  seedActiveWebAccount,
  webAccessToken,
} from "./fixtures/web-auth";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const ACCESS_A = webAccessToken(USER_A, "lineage-a");

/** Seeds the exact active v2 credential captured by web sign-out. */
function seedWebAccountA() {
  // This suite pre-seeds a fixed private write generation instead of adopting
  // one through attestAndAdopt, because sign-out asserts against the exact
  // generation value it expects to rotate away from.
  localStorage.setItem(
    "biblequest:web-private-write-generation:v1",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  seedActiveWebAccount(USER_A, {
    sessionId: "lineage-a",
    accessToken: ACCESS_A,
    refreshToken: "refresh-a",
  });
}

function authClient(userId = USER_A) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: ACCESS_A,
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
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
      ACCESS_A,
      "global",
    );
    expect(clearSession).toHaveBeenCalledWith({
      userId: USER_A,
      accessToken: ACCESS_A,
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
      accessToken: ACCESS_A,
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
      accessToken: ACCESS_A,
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

describe("safe web account sign-out", () => {
  it("revokes A off-storage and clears only the captured A credential", async () => {
    seedWebAccountA();
    localStorage.setItem("biblequest:v1", "rollback-visible-fixture");
    const owner = authClient();
    const revocation = revocationClient();
    revocation.auth.admin.signOut.mockImplementationOnce(async () => {
      expect(localStorage.getItem("biblequest:v1")).toBeNull();
      return { error: null };
    });
    const clearWebSubject = vi.fn(async () => "cleared" as const);

    await expect(
      signOutExpectedAccount(USER_A, {
        authClient: owner,
        clearWebSubject,
        native: false,
        revocationClient: revocation,
      }),
    ).resolves.toEqual({ status: "signed-out", reloadRequired: true });

    expect(revocation.auth.admin.signOut).toHaveBeenCalledWith(
      ACCESS_A,
      "global",
    );
    expect(clearWebSubject).toHaveBeenCalledWith(USER_A, expect.any(Object));
    expect(owner.auth.signOut).not.toHaveBeenCalled();
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("preserves B and performs no revocation when B replaced A before capture", async () => {
    const owner = authClient(USER_B);
    const revocation = revocationClient();
    const clearWebSubject = vi.fn();

    await expect(
      signOutExpectedAccount(USER_A, {
        authClient: owner,
        clearWebSubject,
        native: false,
        revocationClient: revocation,
      }),
    ).resolves.toEqual({
      status: "session-changed",
      reloadRequired: true,
    });

    expect(revocation.auth.admin.signOut).not.toHaveBeenCalled();
    expect(clearWebSubject).not.toHaveBeenCalled();
    expect(owner.auth.signOut).not.toHaveBeenCalled();
    expect(owner.auth.startAutoRefresh).toHaveBeenCalledOnce();
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("never clears or revokes newer B when replacement lands after A capture", async () => {
    seedWebAccountA();
    const owner = authClient();
    const revocation = revocationClient();
    let persistedUserId = USER_B;
    const clearWebSubject = vi.fn(async () => {
      persistedUserId = USER_B;
      return "different-user" as const;
    });

    await expect(
      signOutExpectedAccount(USER_A, {
        authClient: owner,
        clearWebSubject,
        native: false,
        revocationClient: revocation,
      }),
    ).resolves.toEqual({
      status: "session-changed",
      reloadRequired: true,
    });

    expect(revocation.auth.admin.signOut).toHaveBeenCalledWith(
      ACCESS_A,
      "global",
    );
    expect(revocation.auth.admin.signOut).toHaveBeenCalledOnce();
    expect(clearWebSubject).toHaveBeenCalledWith(USER_A, expect.any(Object));
    expect(owner.auth.signOut).not.toHaveBeenCalled();
    expect(persistedUserId).toBe(USER_B);
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("clears a refreshed A after global revocation", async () => {
    seedWebAccountA();
    const owner = authClient();
    const revocation = revocationClient();
    let persistedUserId = USER_A;
    const clearWebSubject = vi.fn(async (expectedUserId: string) => {
      if (persistedUserId !== expectedUserId) return "different-user" as const;
      persistedUserId = "";
      return "cleared" as const;
    });

    await expect(
      signOutExpectedAccount(USER_A, {
        authClient: owner,
        clearWebSubject,
        native: false,
        revocationClient: revocation,
      }),
    ).resolves.toMatchObject({
      status: "signed-out",
      reloadRequired: true,
    });

    expect(clearWebSubject).toHaveBeenCalledWith(USER_A, expect.any(Object));
    expect(persistedUserId).toBe("");
    expect(owner.auth.signOut).not.toHaveBeenCalled();
    expect(accountLifecycleIsActive()).toBe(false);
  });

  it("retains the lifecycle and Web Lock after the caller deadline", async () => {
    vi.useFakeTimers();
    seedWebAccountA();
    const owner = authClient();
    let settleRevoke!: (value: { error: unknown }) => void;
    const revocation = {
      auth: {
        admin: {
          signOut: vi.fn(
            () =>
              new Promise<{ error: unknown }>((resolve) => {
                settleRevoke = resolve;
              }),
          ),
        },
      },
    };
    const clearWebSubject = vi.fn(async () => "cleared" as const);
    const signingOut = signOutExpectedAccount(USER_A, {
      authClient: owner,
      clearWebSubject,
      deadlineMs: 25,
      native: false,
      revocationClient: revocation,
    });
    const rejected = expect(signingOut).rejects.toMatchObject({
      name: "AccountSignOutError",
      reloadRequired: false,
    });

    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(accountLifecycleIsActive()).toBe(true);

    let replacementStarted = false;
    const replacement = withWebAccountOperationLock(async () => {
      replacementStarted = true;
    });
    await Promise.resolve();
    expect(replacementStarted).toBe(false);

    settleRevoke({ error: null });
    await replacement;
    expect(clearWebSubject).toHaveBeenCalledWith(USER_A, expect.any(Object));
    expect(replacementStarted).toBe(true);
    expect(accountLifecycleIsActive()).toBe(false);
  });
});
