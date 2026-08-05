import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

const LATCH = "BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED";
const NATIVE_ORIGIN = "capacitor://localhost";

function nativeRequest(method: string, url: string) {
  return new NextRequest(url, {
    method,
    headers: { origin: NATIVE_ORIGIN, host: "www.biblequest.co" },
  });
}

async function loadProxy() {
  vi.resetModules();
  const { proxy } = await import("@/proxy");
  return proxy;
}

afterEach(() => {
  delete process.env[LATCH];
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED;
  mocks.createServerClient.mockReset();
  vi.resetModules();
});

describe("proxy wiring for the native CORS layer", () => {
  it("short-circuits a native preflight before any session work", async () => {
    process.env[LATCH] = "true";
    const proxy = await loadProxy();
    const response = await proxy(
      nativeRequest("OPTIONS", "https://www.biblequest.co/api/billing/status"),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      NATIVE_ORIGIN,
    );
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("keeps decoration on the response updateSession reassigns", async () => {
    // A sync-enabled build is where updateSession actually constructs a
    // client and its cookie-refresh callback REASSIGNS the response — the
    // exact hazard the decoration must survive. Env must be set before the
    // module graph loads, because containment captures it at import time.
    process.env[LATCH] = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proxy-fixture.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      "proxy-fixture-publishable-key";
    process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED = "true";
    mocks.createServerClient.mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll: (
              cookies: { name: string; value: string; options: object }[],
            ) => void;
          };
        },
      ) => ({
        auth: {
          getUser: async () => {
            options.cookies.setAll([
              { name: "sb-fixture", value: "refreshed", options: {} },
            ]);
            return { data: { user: null }, error: null };
          },
        },
      }),
    );

    const proxy = await loadProxy();
    const response = await proxy(
      nativeRequest("GET", "https://www.biblequest.co/api/arcade/status"),
    );
    expect(mocks.createServerClient).toHaveBeenCalledTimes(1);
    // The cookie refresh replaced the response object; the decoration must
    // sit on the replacement.
    expect(response.headers.get("access-control-allow-origin")).toBe(
      NATIVE_ORIGIN,
    );
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "X-BibleQuest-Avatar-Version",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "sb-fixture=refreshed",
    );
  });

  it("passes web requests through untouched with the latch on", async () => {
    process.env[LATCH] = "true";
    const proxy = await loadProxy();
    const response = await proxy(
      new NextRequest("https://www.biblequest.co/api/arcade/status", {
        headers: { host: "www.biblequest.co" },
      }),
    );
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});
