/**
 * Capacitor's plugin proxy answers every unknown property with a native method
 * wrapper. That includes `then`, which makes the proxy a thenable: resolving a
 * promise with it makes the runtime adopt it and call a native `then` that does
 * not exist, so the promise never settles.
 *
 * On 2026-08-15 that hung the whole iOS account bootstrap. The Keychain backend
 * reported ready, the read behind it never returned, Supabase never emitted an
 * auth event, and `useSession().loading` stayed true forever — the sign-in
 * screen never appeared. Nothing caught it because the account build had never
 * run on a device before, and a hang looks identical to a slow network.
 *
 * These tests pin the invariant: the native auth storage adapter must resolve
 * even when its backend module exports a Capacitor-style proxy.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const ORIGIN = "https://abcdefghijklmnopqrst.supabase.co";
const KEY = "sb-abcdefghijklmnopqrst-auth-token";
const PUBLISHABLE_KEY = `sb_publishable_${"n".repeat(28)}`;
const USER_ID = "00000000-0000-4000-8000-000000000001";
const ACCESS_TOKEN = [
  base64url({ alg: "HS256", typ: "JWT" }),
  base64url({
    sub: USER_ID,
    session_id: "11111111-2222-4333-8444-555555555555",
    role: "authenticated",
    exp: 4_102_444_800,
  }),
  "Zml4dHVyZS1zaWduYXR1cmU",
].join(".");
const REFRESH_TOKEN = "fixture-refresh-token";

/** Encodes the unsigned JWT fixture fields that auth-js reads locally. */
function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Reproduces the Capacitor 8 proxy: any unknown property becomes a method. */
function capacitorStylePlugin(values: Map<string, string>): unknown {
  const real: Record<string, (...args: never[]) => unknown> = {
    getItem: (key: never) => Promise.resolve(values.get(key as string) ?? null),
    setItem: (key: never, value: never) =>
      Promise.resolve(void values.set(key as string, value as string)),
    removeItem: (key: never) =>
      Promise.resolve(void values.delete(key as string)),
    clear: () => Promise.resolve(void values.clear()),
    setKeyPrefix: () => Promise.resolve(),
    setSynchronize: () => Promise.resolve(),
    setDefaultKeychainAccess: () => Promise.resolve(),
  };
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "$$typeof") return undefined;
        if (prop in real) return real[prop];
        // The defect: an unknown property — notably `then` — becomes a native
        // method wrapper whose call never settles.
        return () => new Promise(() => undefined);
      },
    },
  );
}

/** Fails the test rather than hanging the suite when the promise never settles. */
async function withinDeadline<T>(work: Promise<T>, ms = 1_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("native auth storage never settled")),
      ms,
    );
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer!);
  }
}

const values = new Map<string, string>();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: "whenUnlockedThisDeviceOnly" },
  SecureStorage: capacitorStylePlugin(values),
}));

afterEach(() => {
  values.clear();
  delete (
    globalThis as typeof globalThis & {
      __biblequestSupabaseBrowserClient?: unknown;
    }
  ).__biblequestSupabaseBrowserClient;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("native auth storage against a Capacitor plugin proxy", () => {
  it("resolves a read instead of hanging on the proxy's thenable", async () => {
    vi.stubEnv(PLATFORM, "ios");
    const { createNativeAuthStorage } = await import(
      "@/lib/supabase/native-auth-storage"
    );

    // Returning the proxy through the loader's promise hangs here forever.
    await expect(
      withinDeadline(createNativeAuthStorage().getItem(KEY)),
    ).resolves.toBeNull();
  });

  it("round-trips a written credential through the proxy backend", async () => {
    vi.stubEnv(PLATFORM, "ios");
    const { createNativeAuthStorage } = await import(
      "@/lib/supabase/native-auth-storage"
    );
    const storage = createNativeAuthStorage();

    await withinDeadline(storage.setItem(KEY, "fixture"));
    await expect(withinDeadline(storage.getItem(KEY))).resolves.toBe("fixture");

    await withinDeadline(storage.removeItem(KEY));
    await expect(withinDeadline(storage.getItem(KEY))).resolves.toBeNull();
  });

  it("round-trips a real native Supabase session through Keychain", async () => {
    vi.stubEnv(PLATFORM, "native");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGIN);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED", "true");
    const recorded: { url: string; headers: Headers }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        recorded.push({
          url: request.url,
          headers: new Headers(request.headers),
        });
        return Response.json(
          {
            id: USER_ID,
            aud: "authenticated",
            role: "authenticated",
            email: "reader@fixture.invalid",
            app_metadata: { provider: "email", providers: ["email"] },
            user_metadata: {},
            created_at: "2026-08-20T00:00:00.000Z",
          },
          { status: 200 },
        );
      }),
    );
    const { createClient } = await import("@/lib/supabase/client");
    const client = createClient();

    try {
      const installed = await withinDeadline(
        client.auth.setSession({
          access_token: ACCESS_TOKEN,
          refresh_token: REFRESH_TOKEN,
        }),
      );
      expect(installed.error).toBeNull();
      expect(installed.data.session?.user.id).toBe(USER_ID);
      expect(installed.data.session?.access_token).toBe(ACCESS_TOKEN);

      const observed = await withinDeadline(client.auth.getSession());
      expect(observed.error).toBeNull();
      expect(observed.data.session?.user.id).toBe(USER_ID);
      expect(observed.data.session?.access_token).toBe(ACCESS_TOKEN);

      const persisted = values.get(KEY);
      expect(persisted).toBeDefined();
      expect(JSON.parse(persisted ?? "{}")).toMatchObject({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        user: { id: USER_ID },
      });

      const identityRequest = recorded.find(
        (entry) => entry.url === `${ORIGIN}/auth/v1/user`,
      );
      expect(identityRequest, "the real client must reach GoTrue").toBeDefined();
      expect(identityRequest?.headers.get("authorization")).toBe(
        `Bearer ${ACCESS_TOKEN}`,
      );
      expect(identityRequest?.headers.get("apikey")).toBe(PUBLISHABLE_KEY);
      expect(
        identityRequest?.headers.get("x-biblequest-native-account-beta"),
      ).toBe("v1");
      expect(identityRequest?.headers.has("x-biblequest-web-auth")).toBe(false);
    } finally {
      await client.auth.stopAutoRefresh();
    }
  });
});
