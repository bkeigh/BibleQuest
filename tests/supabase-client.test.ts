import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createBrowserClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createSupabaseClient,
}));

describe("Supabase browser clients", () => {
  const legacyAnonFixture = [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "eyJyb2xlIjoiYW5vbiJ9",
    "fixture-signature",
  ].join(".");

  beforeEach(() => {
    vi.resetModules();
    mocks.createBrowserClient.mockReset();
    mocks.createSupabaseClient.mockReset();
    delete (
      globalThis as typeof globalThis & {
        __biblequestSupabaseBrowserClient?: unknown;
      }
    ).__biblequestSupabaseBrowserClient;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", legacyAnonFixture);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED", "false");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("prefers the independently rotatable publishable key", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_fixture_1234567890abcdef",
    );
    const authClient = { auth: { getSession: vi.fn() } };
    mocks.createBrowserClient.mockReturnValue(authClient);
    const { createClient } = await import("@/lib/supabase/client");

    expect(createClient()).toBe(authClient);
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      "sb_publishable_fixture_1234567890abcdef",
      { isSingleton: true },
    );
  });

  it("fails closed when the modern variable contains a legacy JWT", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", legacyAnonFixture);
    const { createClient, isSupabaseConfigured } = await import(
      "@/lib/supabase/client"
    );

    expect(isSupabaseConfigured()).toBe(false);
    expect(() => createClient()).toThrow("Supabase is not configured");
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it("rejects a service-role JWT from the legacy public variable", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      [
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        "eyJyb2xlIjoic2VydmljZV9yb2xlIn0",
        "fixture-signature",
      ].join("."),
    );
    const { createClient, isSupabaseConfigured } = await import(
      "@/lib/supabase/client"
    );

    expect(isSupabaseConfigured()).toBe(false);
    expect(() => createClient()).toThrow("Supabase is not configured");
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it("uses one Keychain-backed PKCE auth owner in the native app", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_PLATFORM", "native");
    const authClient = { auth: { getSession: vi.fn() } };
    mocks.createSupabaseClient.mockReturnValue(authClient);
    const { createClient } = await import("@/lib/supabase/client");

    expect(createClient()).toBe(authClient);
    expect(createClient()).toBe(authClient);
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
    expect(mocks.createSupabaseClient).toHaveBeenCalledOnce();
    expect(mocks.createSupabaseClient.mock.calls[0]?.[2]).toMatchObject({
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        storage: {
          getItem: expect.any(Function),
          setItem: expect.any(Function),
          removeItem: expect.any(Function),
        },
      },
    });
  });

  it("creates email-code verification clients without durable auth storage", async () => {
    const verificationClient = { auth: { verifyOtp: vi.fn() } };
    mocks.createSupabaseClient.mockReturnValue(verificationClient);
    const { createEmailOtpVerificationClient } = await import(
      "@/lib/supabase/client"
    );

    expect(createEmailOtpVerificationClient()).toBe(verificationClient);
    expect(mocks.createSupabaseClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      legacyAnonFixture,
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: "pkce",
          persistSession: false,
          storageKey: expect.stringMatching(/^biblequest-email-otp-\d+$/),
        }),
      }),
    );
  });

  it("creates sign-out revocation clients without durable auth storage", async () => {
    const revocationClient = { auth: { admin: { signOut: vi.fn() } } };
    mocks.createSupabaseClient.mockReturnValue(revocationClient);
    const { createAccountSignOutClient } = await import(
      "@/lib/supabase/client"
    );

    expect(createAccountSignOutClient()).toBe(revocationClient);
    expect(mocks.createSupabaseClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      legacyAnonFixture,
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
          storageKey: expect.stringMatching(
            /^biblequest-account-sign-out-\d+$/,
          ),
        }),
      }),
    );
  });

  it("uses the auth singleton only as the generation-bound data token source", async () => {
    const userId = "10000000-0000-4000-8000-000000000001";
    const getSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: "fixture-access-token",
          user: { id: userId },
        },
      },
      error: null,
    });
    const authClient = { auth: { getSession } };
    const syncClient = { rpc: vi.fn() };
    mocks.createBrowserClient.mockReturnValue(authClient);
    mocks.createSupabaseClient.mockReturnValue(syncClient);
    const { createSyncClient } = await import("@/lib/supabase/client");

    expect(
      createSyncClient(userId, 4),
    ).toBe(syncClient);

    const options = mocks.createSupabaseClient.mock.calls[0]?.[2];
    expect(options).toMatchObject({
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          "x-biblequest-expected-user":
            userId,
          "x-biblequest-sync-generation": "4",
        },
      },
    });
    expect(await options.accessToken()).toBe("fixture-access-token");
    expect(getSession).toHaveBeenCalledOnce();
  });

  it("refuses to reuse a token after the authenticated account changes", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: "account-b-token",
          user: { id: "20000000-0000-4000-8000-000000000002" },
        },
      },
      error: null,
    });
    mocks.createBrowserClient.mockReturnValue({ auth: { getSession } });
    mocks.createSupabaseClient.mockReturnValue({ rpc: vi.fn() });
    const { createSyncClient } = await import("@/lib/supabase/client");
    createSyncClient("10000000-0000-4000-8000-000000000001", 4);
    const options = mocks.createSupabaseClient.mock.calls[0]?.[2];

    await expect(options.accessToken()).rejects.toThrow(
      "account sync session changed",
    );
  });

  it("marks native auth, control, and data requests only in the beta build", async () => {
    const userId = "10000000-0000-4000-8000-000000000001";
    vi.stubEnv("NEXT_PUBLIC_APP_PLATFORM", "native");
    vi.stubEnv("NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED", "true");
    const authClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "fixture-access-token",
              user: { id: userId },
            },
          },
          error: null,
        }),
      },
    };
    mocks.createSupabaseClient
      .mockReturnValueOnce(authClient)
      .mockReturnValue({ rpc: vi.fn() });
    const {
      createClient,
      createSyncClient,
      createSyncControlClient,
    } = await import("@/lib/supabase/client");

    createClient();
    createSyncControlClient(userId);
    createSyncClient(userId, 7);

    for (const call of mocks.createSupabaseClient.mock.calls) {
      expect(call[2]).toMatchObject({
        global: {
          headers: {
            "x-biblequest-native-account-beta": "v1",
          },
        },
      });
    }
  });

  it("keeps one auth client across every app consumer", async () => {
    const authClient = { auth: { getSession: vi.fn() } };
    mocks.createBrowserClient.mockReturnValue(authClient);
    const { createClient } = await import("@/lib/supabase/client");

    expect(createClient()).toBe(authClient);
    expect(createClient()).toBe(authClient);
    expect(mocks.createBrowserClient).toHaveBeenCalledOnce();
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      legacyAnonFixture,
      { isSingleton: true },
    );
  });
});
