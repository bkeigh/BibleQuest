import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createBrowserClient,
}));

describe("Supabase browser clients", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createBrowserClient.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fixture-anon-key");
  });

  it("uses the auth singleton only as the generation-bound data token source", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "fixture-access-token" } },
      error: null,
    });
    const authClient = { auth: { getSession } };
    const syncClient = { rpc: vi.fn() };
    mocks.createBrowserClient
      .mockReturnValueOnce(authClient)
      .mockReturnValueOnce(syncClient);
    const { createSyncClient } = await import("@/lib/supabase/client");

    expect(
      createSyncClient("10000000-0000-4000-8000-000000000001", 4),
    ).toBe(syncClient);

    const options = mocks.createBrowserClient.mock.calls[1]?.[2];
    expect(options).toMatchObject({
      isSingleton: false,
      global: {
        headers: {
          "x-biblequest-expected-user":
            "10000000-0000-4000-8000-000000000001",
          "x-biblequest-sync-generation": "4",
        },
      },
    });
    expect(await options.accessToken()).toBe("fixture-access-token");
    expect(getSession).toHaveBeenCalledOnce();
  });
});
