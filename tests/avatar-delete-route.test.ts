import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedContext: vi.fn(),
  createAdmin: vi.fn(),
  recordFailure: vi.fn(),
  userList: vi.fn(),
  adminList: vi.fn(),
}));

vi.mock("@/lib/supabase/authenticated.server", () => ({
  authenticatedServerContext: mocks.authenticatedContext,
}));
vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminSupabase: mocks.createAdmin,
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
    mocks.createAdmin.mockReset();
    mocks.recordFailure.mockReset();
    mocks.userList.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.adminList.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.createAdmin.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          list: mocks.adminList,
          remove: vi.fn(),
        })),
      },
    });
  });

  it("uses the privileged client only after the explicit owner cleanup boundary", async () => {
    const client = userClient();
    mocks.authenticatedContext.mockResolvedValue({
      supabase: client,
      user: { id: USER_ID },
    });

    const response = await DELETE(request(true));

    expect(response.status).toBe(204);
    expect(mocks.createAdmin).toHaveBeenCalledOnce();
    expect(mocks.adminList).toHaveBeenCalledWith(USER_ID, expect.any(Object));
    expect(mocks.userList).not.toHaveBeenCalled();
  });

  it("keeps an ordinary owner sweep on the authenticated RLS client", async () => {
    const client = userClient();
    mocks.authenticatedContext.mockResolvedValue({
      supabase: client,
      user: { id: USER_ID },
    });

    const response = await DELETE(request(false));

    expect(response.status).toBe(204);
    expect(mocks.userList).toHaveBeenCalledWith(USER_ID, expect.any(Object));
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.adminList).not.toHaveBeenCalled();
  });
});
