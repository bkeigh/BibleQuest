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

  it("decorates native customer requests without creating a cookie session", async () => {
    // Customer account transport is bearer-only even in a sync-enabled build.
    // Native CORS remains available without reopening middleware cookie writes.
    process.env[LATCH] = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proxy-fixture.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      "sb_publishable_proxy_fixture_1234567890abcdef";
    process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED = "true";
    const proxy = await loadProxy();
    const response = await proxy(
      nativeRequest("GET", "https://www.biblequest.co/api/arcade/status"),
    );
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("access-control-allow-origin")).toBe(
      NATIVE_ORIGIN,
    );
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "X-BibleQuest-Avatar-Version",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
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
