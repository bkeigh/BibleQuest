import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const TOKEN = "header.payload.signature";
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return { ...actual, createClient: mocks.createClient };
});

vi.mock("@/lib/supabase/configuration", () => ({
  isSupabaseConfigured: () => true,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.createClient.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth-fixture.supabase.co");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_auth_fixture_1234567890abcdef",
  );
});

/** Builds one web request with optional explicit account authority. */
function request(
  options: {
    authorization?: string;
    cleanup?: string;
    expectedUserId?: string;
    nativeMarker?: string;
    webProtocol?: string | null;
  } = {},
) {
  const headers = new Headers({
    cookie: "sb-legacy-auth-token=must-not-be-read",
    origin: "https://www.biblequest.co",
  });
  if (options.authorization !== undefined) {
    headers.set("authorization", options.authorization);
  }
  if (options.cleanup !== undefined) {
    headers.set("x-biblequest-account-deletion-cleanup", options.cleanup);
  }
  if (options.expectedUserId !== undefined) {
    headers.set("x-biblequest-expected-user", options.expectedUserId);
  }
  if (options.nativeMarker !== undefined) {
    headers.set("x-biblequest-native-account-beta", options.nativeMarker);
  }
  const webProtocol =
    options.webProtocol === undefined ? "v2" : options.webProtocol;
  if (webProtocol !== null) {
    headers.set("x-biblequest-web-auth", webProtocol);
  }
  return new Request("https://www.biblequest.co/api/profile/avatar", {
    headers,
  });
}

/** Creates the storage-free client returned by a valid bearer verification. */
function bearerClient(userId = USER_A) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: userId } },
        error: null,
      })),
    },
  };
}

describe("authenticated web server account boundaries", () => {
  it("uses one explicit bearer client and forwards deletion boundaries", async () => {
    const client = bearerClient();
    mocks.createClient.mockReturnValue(client);
    const { authenticatedServerContext } = await import(
      "@/lib/supabase/authenticated.server"
    );

    const result = await authenticatedServerContext(
      request({
        authorization: `Bearer ${TOKEN}`,
        cleanup: "v1",
        expectedUserId: USER_A,
      }),
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(client.auth.getUser).toHaveBeenCalledWith(TOKEN);
    expect(result).toMatchObject({
      supabase: client,
      storageSupabase: client,
      user: { id: USER_A },
    });
    const options = mocks.createClient.mock.calls[0]?.[2] as {
      global: { headers: Record<string, string> };
    };
    expect(options.global.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "x-biblequest-account-deletion-cleanup": "v1",
      "x-biblequest-expected-user": USER_A,
      "x-biblequest-web-auth": "v2",
    });
  });

  it.each([null, "v1", "V2"])(
    "rejects absent or wrong web protocol marker %s",
    async (webProtocol) => {
      const { authenticatedServerContext } = await import(
        "@/lib/supabase/authenticated.server"
      );

      const result = await authenticatedServerContext(
        request({
          authorization: `Bearer ${TOKEN}`,
          expectedUserId: USER_A,
          webProtocol,
        }),
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "Bearer malformed", "Basic header.payload.signature"])(
    "rejects missing or malformed web authority without a cookie fallback",
    async (authorization) => {
      const { authenticatedServerContext } = await import(
        "@/lib/supabase/authenticated.server"
      );

      const result = await authenticatedServerContext(
        request({ authorization, expectedUserId: USER_A }),
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("rejects a stale caller-captured subject", async () => {
    mocks.createClient.mockReturnValue(bearerClient(USER_A));
    const { authenticatedServerContext } = await import(
      "@/lib/supabase/authenticated.server"
    );

    const result = await authenticatedServerContext(
      request({
        authorization: `Bearer ${TOKEN}`,
        expectedUserId: USER_B,
      }),
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("requires the expected-subject boundary on every web bearer", async () => {
    mocks.createClient.mockReturnValue(bearerClient(USER_A));
    const { authenticatedServerContext } = await import(
      "@/lib/supabase/authenticated.server"
    );

    const result = await authenticatedServerContext(
      request({ authorization: `Bearer ${TOKEN}` }),
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("rejects an invalid token without downgrading to the legacy cookie", async () => {
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: Object.assign(new Error("invalid"), { status: 401 }),
        })),
      },
    };
    mocks.createClient.mockReturnValue(client);
    const { authenticatedServerContext } = await import(
      "@/lib/supabase/authenticated.server"
    );

    const result = await authenticatedServerContext(
      request({
        authorization: `Bearer ${TOKEN}`,
        expectedUserId: USER_A,
      }),
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect(mocks.createClient).toHaveBeenCalledOnce();
  });

  it("rejects malformed cleanup and native markers before client construction", async () => {
    const { authenticatedServerContext } = await import(
      "@/lib/supabase/authenticated.server"
    );

    for (const candidate of [
      request({ authorization: `Bearer ${TOKEN}`, cleanup: "wrong" }),
      request({ authorization: `Bearer ${TOKEN}`, nativeMarker: "v1" }),
    ]) {
      const result = await authenticatedServerContext(candidate);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
