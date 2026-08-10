import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const HOSTED = "NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN";
const ACCOUNT_SYNC = "NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED";

type FetchArgs = [string, RequestInit | undefined];

function stubFetch() {
  const calls: FetchArgs[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

async function apiModule() {
  return import("@/lib/platform/api");
}

function mockSupabaseClient(accessToken: string | null, configured = true) {
  const createClient = vi.fn(() => ({
    auth: {
      getSession: async () => ({
        data: {
          session: accessToken ? { access_token: accessToken } : null,
        },
        error: null,
      }),
    },
  }));
  vi.doMock("@/lib/supabase/client", () => ({
    isSupabaseConfigured: () => configured,
    createClient,
  }));
  return createClient;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete process.env[PLATFORM];
  delete process.env[HOSTED];
  delete process.env[ACCOUNT_SYNC];
  vi.doUnmock("@/lib/supabase/client");
  vi.unstubAllGlobals();
});

describe("apiFetch on the web target", () => {
  it("passes the caller's init through by reference with no token", async () => {
    const calls = stubFetch();
    const { apiFetch } = await apiModule();
    const init = { method: "POST", credentials: "same-origin" as const };
    await apiFetch("/api/arcade/status", init);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("/api/arcade/status");
    // Identity, not equality: web behavior is byte-identical to before.
    expect(calls[0][1]).toBe(init);
  });

  it("still throws synchronously on an invalid path", async () => {
    stubFetch();
    const { apiFetch } = await apiModule();
    const { PlatformConfigurationError } = await import(
      "@/lib/platform/runtime"
    );
    expect(() => apiFetch("/not-api")).toThrow(PlatformConfigurationError);
  });
});

describe("apiFetch on the native target", () => {
  beforeEach(() => {
    process.env[PLATFORM] = "native";
    process.env[HOSTED] = "https://www.biblequest.co";
    process.env[ACCOUNT_SYNC] = "true";
  });

  it("injects the session bearer token and keeps the caller's options", async () => {
    const calls = stubFetch();
    mockSupabaseClient("session-token");
    const { apiFetch } = await apiModule();
    await apiFetch("/api/billing/status", {
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(calls[0][0]).toBe("https://www.biblequest.co/api/billing/status");
    const init = calls[0][1]!;
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("same-origin");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer session-token");
  });

  it("merges with existing headers and never sets Content-Type itself", async () => {
    const calls = stubFetch();
    mockSupabaseClient("session-token");
    const { apiFetch } = await apiModule();
    // The avatar upload shape: FormData body, no Content-Type, so the browser
    // generates the multipart boundary.
    await apiFetch("/api/profile/avatar", {
      method: "POST",
      body: new FormData(),
      headers: { "X-Custom": "kept" },
    });
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.get("x-custom")).toBe("kept");
    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.has("content-type")).toBe(false);
  });

  it("never clobbers a caller-supplied Authorization header", async () => {
    const calls = stubFetch();
    mockSupabaseClient("session-token");
    const { apiFetch } = await apiModule();
    await apiFetch("/api/billing/status", {
      headers: { Authorization: "Bearer caller-owned" },
    });
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer caller-owned");
  });

  it("sends no token for guests", async () => {
    const calls = stubFetch();
    mockSupabaseClient(null);
    const { apiFetch } = await apiModule();
    await apiFetch("/api/bible/chapter?book=john");
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.has("authorization")).toBe(false);
  });

  it("degrades to no token when Supabase is unconfigured", async () => {
    const calls = stubFetch();
    mockSupabaseClient(null, false);
    const { apiFetch } = await apiModule();
    await apiFetch("/api/bible/chapter?book=john");
    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0][1]!.headers);
    expect(headers.has("authorization")).toBe(false);
  });

  it.each([undefined, "false"])(
    "never inspects a stale native session while account sync is %s",
    async (value) => {
      if (value === undefined) delete process.env[ACCOUNT_SYNC];
      else process.env[ACCOUNT_SYNC] = value;
      const calls = stubFetch();
      const createClient = mockSupabaseClient("stale-session-token");
      const { apiFetch } = await apiModule();

      await apiFetch("/api/bible/chapter?book=john");

      expect(createClient).not.toHaveBeenCalled();
      const headers = new Headers(calls[0][1]!.headers);
      expect(headers.has("authorization")).toBe(false);
    },
  );
});
