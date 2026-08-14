import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedContext: vi.fn(),
  recordFailure: vi.fn(),
  userList: vi.fn(),
  storageList: vi.fn(),
  storageRemove: vi.fn(),
}));

vi.mock("@/lib/supabase/authenticated.server", () => ({
  authenticatedServerContext: mocks.authenticatedContext,
}));
vi.mock("@/lib/observability/server-failures", () => ({
  recordServerFailure: mocks.recordFailure,
  recordServerFailureReason: mocks.recordFailure,
}));

import { DELETE } from "@/app/api/profile/avatar/route";

const USER_ID = "10000000-0000-4000-8000-000000000001";

interface UserClientOptions {
  contractError?: { code: string; message: string };
  storageContractError?: { code: string; message: string };
  storageContractData?: unknown;
  beginError?: { code: string; message: string };
  deleteError?: { code: string; message: string };
}

/** Builds the minimum authenticated client contract used by avatar deletion. */
function userClient(options: UserClientOptions = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "profile_avatar_contract") {
      return {
        data: options.contractError
          ? null
          : { contract: "biblequest_profile_avatar_v1", ok: true },
        error: options.contractError ?? null,
      };
    }
    if (name === "begin_own_account_deletion") {
      return {
        data: null,
        error: options.beginError ?? null,
      };
    }
    if (name === "account_deletion_storage_contract") {
      return {
        data:
          options.storageContractData ??
          (options.storageContractError
            ? null
            : {
                contract: "biblequest_account_deletion_storage_v1",
                ok: true,
              }),
        error: options.storageContractError ?? null,
      };
    }
    if (name === "delete_own_account") {
      return {
        data: null,
        error: options.deleteError ?? null,
      };
    }
    return {
      data: { cleared: true, previous_path: null },
      error: null,
    };
  });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      avatar_path: null,
      avatar_version: null,
      avatar_updated_at: null,
    },
    error: null,
  });
  return {
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        list: mocks.userList,
        remove: mocks.storageRemove,
      })),
    },
  };
}

/** Builds one same-origin owner sweep with optional deletion-only markers. */
function request(cleanup: boolean): Request {
  return new Request("https://preview.biblequest.test/api/profile/avatar", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://preview.biblequest.test",
      ...(cleanup
        ? {
            "x-biblequest-expected-user": USER_ID,
            "x-biblequest-account-deletion-cleanup": "v1",
          }
        : {}),
    },
    body: JSON.stringify({ allOwnedObjects: true }),
  });
}

describe("avatar account-deletion sweep", () => {
  beforeEach(() => {
    process.env.BIBLEQUEST_AVATAR_SYNC_ENABLED = "false";
    mocks.authenticatedContext.mockReset();
    mocks.recordFailure.mockReset();
    mocks.userList.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.storageList.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.storageRemove.mockReset().mockResolvedValue({ error: null });
  });

  /** Builds the explicit bearer client reserved for Storage operations. */
  function storageClient() {
    return {
      storage: {
        from: vi.fn(() => ({
          list: mocks.storageList,
          remove: mocks.storageRemove,
        })),
      },
    };
  }

  it("uses the verified bearer client for an owner cleanup sweep", async () => {
    const client = userClient();
    const storage = storageClient();
    mocks.authenticatedContext.mockResolvedValue({
      supabase: client,
      storageSupabase: storage,
      user: { id: USER_ID },
    });

    const response = await DELETE(request(true));

    expect(response.status).toBe(204);
    expect(mocks.storageList).toHaveBeenCalledWith(USER_ID, expect.any(Object));
    expect(mocks.userList).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith("delete_own_account");
    expect(client.rpc).not.toHaveBeenCalledWith(
      "clear_profile_avatar",
      expect.anything(),
    );
  });

  it("fails closed when the private avatar contract is unavailable", async () => {
    const client = userClient({
      contractError: { code: "PGRST202", message: "contract unavailable" },
    });
    mocks.authenticatedContext.mockResolvedValue({
      supabase: client,
      storageSupabase: storageClient(),
      user: { id: USER_ID },
    });

    const response = await DELETE(request(true));

    expect(response.status).toBe(503);
    expect(mocks.storageList).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalledWith(
      "begin_own_account_deletion",
    );
    expect(client.rpc).not.toHaveBeenCalledWith("delete_own_account");
  });

  it("rejects a missing deletion latch without sweeping Storage", async () => {
    const client = userClient({
      beginError: {
        code: "PGRST202",
        message: "Could not find public.begin_own_account_deletion",
      },
    });
    mocks.authenticatedContext.mockResolvedValue({
      supabase: client,
      storageSupabase: storageClient(),
      user: { id: USER_ID },
    });

    const response = await DELETE(request(true));

    expect(response.status).toBe(503);
    expect(mocks.storageList).not.toHaveBeenCalled();
    expect(mocks.recordFailure).toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalledWith("delete_own_account");
  });

  it("rejects a partial deletion schema before latching or sweeping", async () => {
    const client = userClient({
      storageContractError: {
        code: "PGRST202",
        message: "Could not find the Storage deletion contract",
      },
    });
    mocks.authenticatedContext.mockResolvedValue({
      supabase: client,
      storageSupabase: storageClient(),
      user: { id: USER_ID },
    });

    const response = await DELETE(request(true));

    expect(response.status).toBe(503);
    expect(client.rpc).not.toHaveBeenCalledWith(
      "begin_own_account_deletion",
    );
    expect(mocks.storageList).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalledWith("delete_own_account");
  });

  it("rejects every successful but invalid deletion contract body", async () => {
    const invalidContracts = [
      { contract: "wrong", ok: true },
      { contract: "biblequest_account_deletion_storage_v1", ok: false },
      {
        contract: "biblequest_account_deletion_storage_v1",
        ok: true,
        extra: true,
      },
    ];

    for (const storageContractData of invalidContracts) {
      const client = userClient({ storageContractData });
      mocks.authenticatedContext.mockResolvedValue({
        supabase: client,
        storageSupabase: storageClient(),
        user: { id: USER_ID },
      });

      const response = await DELETE(request(true));

      expect(response.status).toBe(503);
      expect(client.rpc).not.toHaveBeenCalledWith(
        "begin_own_account_deletion",
      );
      expect(client.rpc).not.toHaveBeenCalledWith("delete_own_account");
    }
    expect(mocks.storageList).not.toHaveBeenCalled();
  });

  it("removes observed owner objects before returning latched success", async () => {
    mocks.storageList.mockResolvedValueOnce({
      data: [{ name: "avatar-11111111-1111-4111-8111-111111111111.webp" }],
      error: null,
    });
    const client = userClient();
    mocks.authenticatedContext.mockResolvedValue({
      supabase: client,
      storageSupabase: storageClient(),
      user: { id: USER_ID },
    });

    const response = await DELETE(request(true));

    expect(response.status).toBe(204);
    expect(mocks.storageRemove).toHaveBeenCalledWith([
      `${USER_ID}/avatar-11111111-1111-4111-8111-111111111111.webp`,
    ]);
    expect(client.rpc).toHaveBeenCalledWith("delete_own_account");
    const beginCall = client.rpc.mock.calls.findIndex(
      ([name]) => name === "begin_own_account_deletion",
    );
    const deleteCall = client.rpc.mock.calls.findIndex(
      ([name]) => name === "delete_own_account",
    );
    expect(client.rpc.mock.invocationCallOrder[beginCall]).toBeLessThan(
      mocks.storageList.mock.invocationCallOrder[0],
    );
    expect(mocks.storageRemove.mock.invocationCallOrder[0]).toBeLessThan(
      client.rpc.mock.invocationCallOrder[deleteCall],
    );
    expect(client.rpc).not.toHaveBeenCalledWith(
      "clear_profile_avatar",
      expect.anything(),
    );
  });

  it("fails closed when the final empty-folder account purge fails", async () => {
    const client = userClient({
      deleteError: { code: "P0001", message: "avatar storage not empty" },
    });
    mocks.authenticatedContext.mockResolvedValue({
      supabase: client,
      storageSupabase: storageClient(),
      user: { id: USER_ID },
    });

    const response = await DELETE(request(true));

    expect(response.status).toBe(503);
    expect(mocks.storageList).toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith("delete_own_account");
    expect(client.rpc).not.toHaveBeenCalledWith(
      "clear_profile_avatar",
      expect.anything(),
    );
    expect(mocks.recordFailure).toHaveBeenCalled();
  });

  it("keeps an ordinary owner sweep on the verified bearer client", async () => {
    const client = userClient();
    const storage = storageClient();
    mocks.authenticatedContext.mockResolvedValue({
      supabase: client,
      storageSupabase: storage,
      user: { id: USER_ID },
    });

    const response = await DELETE(request(false));

    expect(response.status).toBe(204);
    expect(mocks.storageList).toHaveBeenCalledWith(USER_ID, expect.any(Object));
    expect(mocks.userList).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalledWith("delete_own_account");
  });
});
