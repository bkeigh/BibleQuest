import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/platform/web-auth-service-worker", () => ({
  requireWebAuthServiceWorkerAttestation: vi.fn().mockResolvedValue(undefined),
}));
import {
  AccountDeletionError,
  AccountDeletionPendingError,
  ACCOUNT_DELETION_STATUS_CONTRACT,
  deleteAccountAndDeviceData,
  deleteOwnAccount,
  deleteOwnAccountWithAvatar,
  ownAccountDeletionIsPending,
} from "@/lib/auth/account-deletion";
import {
  beginAccountLifecycle,
  finishAccountLifecycle,
} from "@/lib/auth/account-lifecycle";
import { withWebAccountOperationLock } from "@/lib/supabase/web-auth-storage";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const ACCOUNT_SYNC = "NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED";
const ACCOUNT_BETA = "NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED";

/** Seeds one strict active v2 envelope for complete web-deletion tests. */
function seedWebAccountA() {
  const accessToken = `fixture.${Buffer.from(
    JSON.stringify({ sub: USER_A, session_id: "lineage-a" }),
  ).toString("base64url")}.signature`;
  localStorage.setItem(
    "biblequest:web-private-write-generation:v1",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  localStorage.setItem("biblequest:web-private:namespace:v2", "complete");
  localStorage.setItem(
    "biblequest:web-private:v2:last-sync-user",
    USER_A,
  );
  localStorage.setItem(
    "biblequest:web-auth:v2",
    JSON.stringify({
      version: 2,
      mode: "active",
      session: {
        access_token: accessToken,
        refresh_token: "refresh-a",
        user: { id: USER_A },
      },
    }),
  );
}

beforeEach(() => {
  process.env[PLATFORM] = "web";
  localStorage.clear();
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
  it("calls only the zero-argument owner RPC before device cleanup", async () => {
    const fixture = client();

    await deleteOwnAccount(USER_A, fixture.client);

    expect(fixture.rpc).toHaveBeenCalledWith("delete_own_account");
    expect(fixture.getSession).not.toHaveBeenCalled();
    expect(fixture.signOut).not.toHaveBeenCalled();
  });

  it("keeps the session and device journey untouched when deletion fails", async () => {
    const fixture = client({ code: "42501", message: "private fixture" });

    await expect(
      deleteOwnAccount(USER_A, fixture.client),
    ).rejects.toBeInstanceOf(AccountDeletionError);
    expect(fixture.signOut).not.toHaveBeenCalled();
  });

  it("keeps the full Web Lock after the caller-visible deletion deadline", async () => {
    vi.useFakeTimers();
    seedWebAccountA();
    let settle!: () => void;
    const deferred = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const lifecycle = beginAccountLifecycle(USER_A)!;
    const purgeDevice = vi.fn(async () => true);
    const deletion = deleteAccountAndDeviceData(USER_A, lifecycle, {
      removeOwnedAvatars: vi.fn(() => deferred),
      purgeDevice,
    });
    const rejected = expect(deletion).rejects.toBeInstanceOf(
      AccountDeletionPendingError,
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(purgeDevice).not.toHaveBeenCalled();

    let laterAccountStarted = false;
    const laterAccount = withWebAccountOperationLock(async () => {
      laterAccountStarted = true;
    });
    await Promise.resolve();
    expect(laterAccountStarted).toBe(false);

    settle();
    await laterAccount;
    expect(purgeDevice).toHaveBeenCalledWith(USER_A, lifecycle, expect.anything());
    expect(laterAccountStarted).toBe(true);
    finishAccountLifecycle(lifecycle);
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
        deleteOwnAccount(USER_A, fixture.client),
      ).rejects.toBeInstanceOf(AccountDeletionPendingError);
      expect(fixture.signOut).not.toHaveBeenCalled();
    },
  );

  it("treats a rejected irreversible deletion request as pending", async () => {
    const fixture = client();
    fixture.rpc.mockRejectedValue(new TypeError("private transport failure"));

    await expect(
      deleteOwnAccount(USER_A, fixture.client),
    ).rejects.toBeInstanceOf(AccountDeletionPendingError);
    expect(fixture.signOut).not.toHaveBeenCalled();
  });

  it("does not sign out a newer account after the server deletes the expected one", async () => {
    const fixture = client(null, USER_B);

    await deleteOwnAccount(USER_A, fixture.client);

    expect(fixture.rpc).toHaveBeenCalledOnce();
    expect(fixture.getSession).not.toHaveBeenCalled();
    expect(fixture.signOut).not.toHaveBeenCalled();
  });

  it("leaves native sign-out to the serialized expected-user cleanup", async () => {
    process.env[PLATFORM] = "native";
    const fixture = client();

    await deleteOwnAccount(USER_A, fixture.client);

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
    ).rejects.toBeInstanceOf(AccountDeletionPendingError);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("requires the exact sealed deletion-status response", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          contract: ACCOUNT_DELETION_STATUS_CONTRACT,
          pending: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          contract: ACCOUNT_DELETION_STATUS_CONTRACT,
          pending: true,
        },
        error: null,
      });
    const statusClient = { rpc } as unknown as SupabaseClient;

    await expect(
      ownAccountDeletionIsPending(USER_A, statusClient),
    ).resolves.toBe(false);
    await expect(
      ownAccountDeletionIsPending(USER_A, statusClient),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("own_account_deletion_status");
  });

  it.each([
    null,
    { contract: ACCOUNT_DELETION_STATUS_CONTRACT, pending: "false" },
    {
      contract: ACCOUNT_DELETION_STATUS_CONTRACT,
      pending: false,
      extra: true,
    },
    { contract: "wrong", pending: false },
  ])("fails closed for malformed deletion status %#", async (data) => {
    const statusClient = {
      rpc: vi.fn().mockResolvedValue({ data, error: null }),
    } as unknown as SupabaseClient;

    await expect(
      ownAccountDeletionIsPending(USER_A, statusClient),
    ).rejects.toBeInstanceOf(AccountDeletionError);
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

  it("contains a rejected auto-refresh stop after native deletion verification", async () => {
    process.env[PLATFORM] = "native";
    process.env[ACCOUNT_SYNC] = "true";
    process.env[ACCOUNT_BETA] = "true";
    vi.resetModules();
    const { verifiedNativeDeletionUserId } = await import(
      "@/lib/auth/account-deletion"
    );
    const authClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "stable-token",
              user: { id: USER_A },
            },
          },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: USER_A } },
          error: null,
        }),
        stopAutoRefresh: vi.fn().mockRejectedValue(
          new Error("private refresh shutdown failure"),
        ),
      },
    } as unknown as SupabaseClient;

    await expect(verifiedNativeDeletionUserId(authClient)).resolves.toBe(
      USER_A,
    );
    expect(authClient.auth.stopAutoRefresh).toHaveBeenCalledOnce();
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
