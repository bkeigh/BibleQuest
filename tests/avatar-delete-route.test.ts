import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedContext: vi.fn(),
  recordFailure: vi.fn(),
  userList: vi.fn(),
  storageList: vi.fn(),
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

/** Builds the minimum authenticated client contract used by avatar deletion. */
function userClient() {
  const rpc = vi.fn(async (name: string) => {
    if (name === "profile_avatar_contract") {
      return {
        data: { contract: "biblequest_profile_avatar_v1", ok: true },
        error: null,
      };
    }
    if (name === "begin_own_account_deletion") {
      return {
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find public.begin_own_account_deletion",
        },
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
        remove: vi.fn(),
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
  });

  /** Builds the explicit bearer client reserved for Storage operations. */
  function storageClient() {
    return {
      storage: {
        from: vi.fn(() => ({
          list: mocks.storageList,
          remove: vi.fn(),
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
    expect(client.rpc).not.toHaveBeenCalledWith(
      "clear_profile_avatar",
      expect.anything(),
    );
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
  });
});
