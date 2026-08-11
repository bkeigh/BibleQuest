import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: mocks.createServerSupabase,
  isSupabaseConfigured: () => true,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.createServerSupabase.mockReset();
});

/** Build one same-origin request carrying the reviewed deletion boundaries. */
function request(cleanup = "v1") {
  return new Request("https://www.biblequest.co/api/profile/avatar", {
    headers: {
      origin: "https://www.biblequest.co",
      "x-biblequest-account-deletion-cleanup": cleanup,
      "x-biblequest-expected-user": USER_ID,
    },
  });
}

describe("authenticated server account boundaries", () => {
  it("forwards exact web deletion markers to the verified RLS client", async () => {
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: USER_ID } },
          error: null,
        })),
      },
    };
    mocks.createServerSupabase.mockResolvedValue(client);
    const { authenticatedServerContext } = await import(
      "@/lib/supabase/authenticated.server"
    );

    const result = await authenticatedServerContext(request());

    expect(result).not.toBeInstanceOf(Response);
    expect(mocks.createServerSupabase).toHaveBeenCalledWith({
      "x-biblequest-account-deletion-cleanup": "v1",
      "x-biblequest-expected-user": USER_ID,
    });
  });

  it("rejects a malformed cleanup marker before constructing a client", async () => {
    const { authenticatedServerContext } = await import(
      "@/lib/supabase/authenticated.server"
    );

    const result = await authenticatedServerContext(request("wrong"));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    expect(mocks.createServerSupabase).not.toHaveBeenCalled();
  });
});
