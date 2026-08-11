import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AccountDeletionError,
  AccountDeletionPendingError,
  deleteOwnAccount,
  deleteOwnAccountWithAvatar,
} from "@/lib/auth/account-deletion";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const ACCOUNT_SYNC = "NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED";
const ACCOUNT_BETA = "NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED";

beforeEach(() => {
  process.env[PLATFORM] = "web";
});

afterEach(() => {
  delete process.env[PLATFORM];
  delete process.env[ACCOUNT_SYNC];
  delete process.env[ACCOUNT_BETA];
  vi.useRealTimers();
});

/** Build the narrow authenticated client surface used by account deletion. */
function client(
  error: unknown = null,
  sessionUserId: string | null = USER_A,
  status?: number,
) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error, status });
  const getSession = vi.fn().mockResolvedValue({
    data: {
      session: sessionUserId ? { user: { id: sessionUserId } } : null,
    },
    error: null,
  });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  return {
    client: { rpc, auth: { getSession, signOut } } as unknown as SupabaseClient,
    getSession,
    rpc,
    signOut,
  };
}

describe("self-service account deletion", () => {
  it("calls the zero-argument owner RPC then clears the local session", async () => {
    const fixture = client();

    await deleteOwnAccount(USER_A, fixture.client, fixture.client);

    expect(fixture.rpc).toHaveBeenCalledWith("delete_own_account");
    expect(fixture.getSession).toHaveBeenCalledOnce();
    expect(fixture.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps the session and device journey untouched when deletion fails", async () => {
    const fixture = client({ code: "42501", message: "private fixture" });

    await expect(
      deleteOwnAccount(USER_A, fixture.client, fixture.client),
    ).rejects.toBeInstanceOf(AccountDeletionError);
    expect(fixture.signOut).not.toHaveBeenCalled();
  });

  it("treats a timed-out irreversible deletion as pending even if it settles later", async () => {
    vi.useFakeTimers();
    let settle!: (value: { data: null; error: null }) => void;
    const deferred = new Promise<{ data: null; error: null }>((resolve) => {
      settle = resolve;
    });
    const fixture = client();
    fixture.rpc.mockReturnValue(deferred);

    const deletion = expect(
      deleteOwnAccount(USER_A, fixture.client, fixture.client),
    ).rejects.toBeInstanceOf(AccountDeletionPendingError);
    await vi.advanceTimersByTimeAsync(15_000);
    await deletion;

    settle({ data: null, error: null });
    await Promise.resolve();
    expect(fixture.signOut).not.toHaveBeenCalled();
  });

  it.each([0, 503])(
    "treats an irreversible deletion response with status %i as pending",
    async (status) => {
      const fixture = client(
        { code: "transport_failure", message: "private fixture" },
        USER_A,
        status,
      );

      await expect(
        deleteOwnAccount(USER_A, fixture.client, fixture.client),
      ).rejects.toBeInstanceOf(AccountDeletionPendingError);
      expect(fixture.signOut).not.toHaveBeenCalled();
    },
  );

  it("treats a rejected irreversible deletion request as pending", async () => {
    const fixture = client();
    fixture.rpc.mockRejectedValue(new TypeError("private transport failure"));

    await expect(
      deleteOwnAccount(USER_A, fixture.client, fixture.client),
    ).rejects.toBeInstanceOf(AccountDeletionPendingError);
    expect(fixture.signOut).not.toHaveBeenCalled();
  });

  it("does not sign out a newer account after the server deletes the expected one", async () => {
    const fixture = client(null, USER_B);

    await deleteOwnAccount(USER_A, fixture.client, fixture.client);

    expect(fixture.rpc).toHaveBeenCalledOnce();
    expect(fixture.signOut).not.toHaveBeenCalled();
  });

  it("leaves native sign-out to the serialized expected-user cleanup", async () => {
    process.env[PLATFORM] = "native";
    const fixture = client();

    await deleteOwnAccount(USER_A, fixture.client, fixture.client);

    expect(fixture.rpc).toHaveBeenCalledOnce();
    expect(fixture.getSession).not.toHaveBeenCalled();
    expect(fixture.signOut).not.toHaveBeenCalled();
  });

  it("removes owned avatar objects before deleting the Auth identity", async () => {
    const order: string[] = [];
    const removeOwnedAvatars = vi.fn(async () => {
      order.push("avatar");
    });
    const deleteAccount = vi.fn(async () => {
      order.push("account");
    });

    await deleteOwnAccountWithAvatar(
      USER_A,
      removeOwnedAvatars,
      deleteAccount,
    );

    expect(order).toEqual(["avatar", "account"]);
    expect(removeOwnedAvatars).toHaveBeenCalledWith(USER_A);
    expect(deleteAccount).toHaveBeenCalledWith(USER_A);
  });

  it("does not attempt identity deletion when avatar cleanup fails", async () => {
    const removeOwnedAvatars = vi
      .fn()
      .mockRejectedValue(new Error("private fixture"));
    const deleteAccount = vi.fn();

    await expect(
      deleteOwnAccountWithAvatar(USER_A, removeOwnedAvatars, deleteAccount),
    ).rejects.toThrow("private fixture");
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("recovers only one stable server-verified native subject for disabled-beta deletion", async () => {
    process.env[PLATFORM] = "native";
    process.env[ACCOUNT_SYNC] = "true";
    process.env[ACCOUNT_BETA] = "true";
    vi.resetModules();
    const { verifiedNativeDeletionUserId } = await import(
      "@/lib/auth/account-deletion"
    );
    const getSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: "stable-token",
          user: { id: USER_A },
        },
      },
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });
    const stopAutoRefresh = vi.fn();
    const authClient = {
      auth: { getSession, getUser, stopAutoRefresh },
    } as unknown as SupabaseClient;

    await expect(verifiedNativeDeletionUserId(authClient)).resolves.toBe(
      USER_A,
    );
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(getUser).toHaveBeenCalledWith("stable-token");
    expect(stopAutoRefresh).toHaveBeenCalledOnce();
  });

  it("refuses disabled-beta deletion recovery after the credential changes", async () => {
    process.env[PLATFORM] = "native";
    process.env[ACCOUNT_SYNC] = "true";
    process.env[ACCOUNT_BETA] = "true";
    vi.resetModules();
    const { verifiedNativeDeletionUserId } = await import(
      "@/lib/auth/account-deletion"
    );
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          session: { access_token: "token-a", user: { id: USER_A } },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          session: { access_token: "token-b", user: { id: USER_B } },
        },
        error: null,
      });
    const authClient = {
      auth: {
        getSession,
        stopAutoRefresh: vi.fn(),
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: USER_A } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient;

    await expect(
      verifiedNativeDeletionUserId(authClient),
    ).rejects.toMatchObject({ name: "AccountDeletionError" });
    expect(authClient.auth.stopAutoRefresh).toHaveBeenCalledOnce();
  });
});
