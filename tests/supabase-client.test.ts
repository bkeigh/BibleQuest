import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
  WEB_PRIVATE_NAMESPACE_V2_MARKER,
  WEB_V2_LAST_SYNC_USER_STORAGE_KEY,
} from "@/lib/storage/web-private-namespace";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
  createSupabaseClient: vi.fn(),
  requireAttestation: vi.fn(),
  coordinateHydration: vi.fn(),
  removeLegacyResidue: vi.fn(),
}));

const WEB_AUTH_KEY = "biblequest:web-auth:v2";

/** Encodes a v2 access token with exact subject and session lineage claims. */
function webAccessToken(userId: string, sessionId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, session_id: sessionId }),
  ).toString("base64url");
  return `fixture.${payload}.signature`;
}

/** Seeds the browser-owned active envelope used by deferred sync token reads. */
function seedWebSession(userId: string, sessionId = "fixture-lineage") {
  const token = webAccessToken(userId, sessionId);
  localStorage.setItem(
    WEB_AUTH_KEY,
    JSON.stringify({
      version: 2,
      mode: "active",
      session: {
        access_token: token,
        refresh_token: `refresh-${sessionId}`,
        user: { id: userId },
      },
    }),
  );
  localStorage.setItem(
    WEB_PRIVATE_NAMESPACE_V2_MARKER,
    WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
  );
  localStorage.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, userId);
  return token;
}

/**
 * Attests this realm and adopts the private write generation for the seeded
 * owner. Reads of the active envelope are refused until both hold, so a test
 * that only takes the account lock never reaches the assertion it intends.
 */
async function attestAndAdopt(userId: string): Promise<void> {
  const {
    adoptCurrentWebPrivateWriteGeneration,
    requireCurrentWebAccountRealm,
    withWebAccountOperationLock,
  } = await import("@/lib/supabase/web-auth-storage");
  await withWebAccountOperationLock(async (handle) => {
    await requireCurrentWebAccountRealm(handle);
    const adopted = await adoptCurrentWebPrivateWriteGeneration(handle, userId);
    if (!adopted) {
      throw new Error("fixture could not adopt the private write generation");
    }
  });
}

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createBrowserClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createSupabaseClient,
}));

vi.mock("@/lib/platform/web-auth-service-worker", () => ({
  requireWebAuthServiceWorkerAttestation: mocks.requireAttestation,
}));

vi.mock("@/lib/questos/store", () => ({
  coordinateQuestOSWebPrivateHydration: mocks.coordinateHydration,
  useQuestOS: { persist: { rehydrate: vi.fn() } },
}));

// The residue proof belongs to the cutover engine and is covered by its own
// suite. Stub only that call so this file keeps testing the client's token
// boundary rather than re-deriving a full cutover fixture.
vi.mock("@/lib/storage/web-private-cutover", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  removeAndProveLegacyWebPrivateResidue: mocks.removeLegacyResidue,
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
    mocks.requireAttestation.mockReset();
    mocks.requireAttestation.mockResolvedValue(undefined);
    mocks.coordinateHydration.mockReset();
    mocks.coordinateHydration.mockResolvedValue(true);
    mocks.removeLegacyResidue.mockReset();
    mocks.removeLegacyResidue.mockResolvedValue(true);
    delete (
      globalThis as typeof globalThis & {
        __biblequestSupabaseBrowserClient?: unknown;
      }
    ).__biblequestSupabaseBrowserClient;
    delete (
      globalThis as typeof globalThis & {
        __biblequestSupabaseConsoleClient?: unknown;
      }
    ).__biblequestSupabaseConsoleClient;
    localStorage.clear();
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
    mocks.createSupabaseClient.mockReturnValue(authClient);
    const { createClient } = await import("@/lib/supabase/client");

    expect(createClient()).toBe(authClient);
    expect(mocks.createSupabaseClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      "sb_publishable_fixture_1234567890abcdef",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: true,
          autoRefreshToken: true,
          storageKey: WEB_AUTH_KEY,
          storage: expect.objectContaining({
            getItem: expect.any(Function),
            setItem: expect.any(Function),
            removeItem: expect.any(Function),
          }),
          lock: expect.any(Function),
        }),
        global: { headers: { "x-biblequest-web-auth": "v2" } },
      }),
    );
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it("fails closed when the modern variable contains a legacy JWT", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", legacyAnonFixture);
    const { createClient, isSupabaseConfigured } = await import(
      "@/lib/supabase/client"
    );

    expect(isSupabaseConfigured()).toBe(false);
    expect(() => createClient()).toThrow("Supabase is not configured");
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
    expect(mocks.createSupabaseClient).not.toHaveBeenCalled();
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
    expect(mocks.createSupabaseClient).not.toHaveBeenCalled();
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
        global: { headers: { "x-biblequest-web-auth": "v2" } },
      }),
    );
  });

  it("creates email-code request clients without primary or cookie storage", async () => {
    const requestClient = { auth: { signInWithOtp: vi.fn() } };
    mocks.createSupabaseClient.mockReturnValue(requestClient);
    const { createEmailAuthRequestClient } = await import(
      "@/lib/supabase/client"
    );

    expect(createEmailAuthRequestClient()).toBe(requestClient);
    expect(mocks.createSupabaseClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      legacyAnonFixture,
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: expect.stringMatching(
            /^biblequest-email-otp-request-\d+$/,
          ),
        }),
        global: { headers: { "x-biblequest-web-auth": "v2" } },
      }),
    );
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
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
        global: { headers: { "x-biblequest-web-auth": "v2" } },
      }),
    );
  });

  it("uses the auth singleton only as the generation-bound data token source", async () => {
    const userId = "10000000-0000-4000-8000-000000000001";
    const token = seedWebSession(userId);
    const syncClient = { rpc: vi.fn() };
    mocks.createSupabaseClient.mockReturnValue(syncClient);
    const { createSyncClient } = await import("@/lib/supabase/client");
    await attestAndAdopt(userId);

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
          "x-biblequest-web-auth": "v2",
        },
      },
    });
    expect(await options.accessToken()).toBe(token);
  });

  it("refuses to reuse a token after the authenticated account changes", async () => {
    const seededUserId = "20000000-0000-4000-8000-000000000002";
    seedWebSession(seededUserId, "lineage-b");
    mocks.createSupabaseClient.mockReturnValue({ rpc: vi.fn() });
    const { createSyncClient } = await import("@/lib/supabase/client");
    await attestAndAdopt(seededUserId);
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
      expect(call[2]?.global?.headers).not.toHaveProperty(
        "x-biblequest-web-auth",
      );
    }
  });

  it("keeps one auth client across every app consumer", async () => {
    const authClient = { auth: { getSession: vi.fn() } };
    mocks.createSupabaseClient.mockReturnValue(authClient);
    const { createClient } = await import("@/lib/supabase/client");

    expect(createClient()).toBe(authClient);
    expect(createClient()).toBe(authClient);
    expect(mocks.createSupabaseClient).toHaveBeenCalledOnce();
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it("prevents auth-js construction from creating a token-bearing channel", async () => {
    const posted: unknown[] = [];
    class FixtureBroadcastChannel {
      constructor(name: string) {
        expect(name).not.toBe("");
      }
      postMessage(value: unknown) {
        posted.push(value);
      }
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", FixtureBroadcastChannel);
    const before = Object.getOwnPropertyDescriptor(
      globalThis,
      "BroadcastChannel",
    );
    const authClient = { auth: { getSession: vi.fn() } };
    mocks.createSupabaseClient.mockImplementation(() => {
      if (typeof BroadcastChannel !== "undefined") {
        new BroadcastChannel("supabase-auth").postMessage({
          event: "SIGNED_IN",
          session: { access_token: "must-not-broadcast" },
        });
      }
      return authClient;
    });
    const { createClient } = await import("@/lib/supabase/client");

    expect(createClient()).toBe(authClient);
    expect(posted).toEqual([]);
    expect(Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel")).toEqual(
      before,
    );
  });

  it("keeps the operator console on its separate legacy cookie seam", async () => {
    const consoleClient = { auth: { getSession: vi.fn() } };
    mocks.createBrowserClient.mockReturnValue(consoleClient);
    const { createConsoleClient } = await import("@/lib/supabase/client");

    expect(createConsoleClient()).toBe(consoleClient);
    expect(createConsoleClient()).toBe(consoleClient);
    expect(mocks.createBrowserClient).toHaveBeenCalledOnce();
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      legacyAnonFixture,
      { isSingleton: true },
    );
    expect(mocks.createSupabaseClient).not.toHaveBeenCalled();
  });
});
