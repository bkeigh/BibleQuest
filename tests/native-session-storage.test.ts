import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNativeCookieStorage,
  nativeAuthClientOptions,
  nativeCookieStorage,
} from "@/lib/supabase/native-cookie-storage";
import { resolveAuthCallbackUrl } from "@/lib/platform/auth";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";

class MemoryStorage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
  setItem(k: string, v: string) {
    this.values.set(k, String(v));
  }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  process.env[PLATFORM] = "native";
});

afterEach(() => {
  delete process.env[PLATFORM];
  vi.unstubAllGlobals();
});

/**
 * `document.cookie` is a measured no-op at capacitor://localhost, and
 * @supabase/ssr persists the entire session through it. These cover the
 * adapter that stands in for it.
 */
describe("native cookie storage", () => {
  it("round-trips a session cookie", () => {
    const store = nativeCookieStorage();
    store.setAll([{ name: "sb-proj-auth-token", value: "base64-abc" }]);
    expect(store.getAll()).toEqual([
      { name: "sb-proj-auth-token", value: "base64-abc" },
    ]);
  });

  it("keeps chunked cookies distinct, as the ssr package splits at 3180 chars", () => {
    const store = nativeCookieStorage();
    store.setAll([
      { name: "sb-proj-auth-token.0", value: "a".repeat(3180) },
      { name: "sb-proj-auth-token.1", value: "b".repeat(500) },
    ]);
    const all = store.getAll();
    expect(all).toHaveLength(2);
    expect(all.find((c) => c.name.endsWith(".0"))?.value).toHaveLength(3180);
    expect(all.find((c) => c.name.endsWith(".1"))?.value).toHaveLength(500);
  });

  it("updates an existing cookie rather than duplicating it", () => {
    const store = nativeCookieStorage();
    store.setAll([{ name: "token", value: "first" }]);
    store.setAll([{ name: "token", value: "second" }]);
    expect(store.getAll()).toEqual([{ name: "token", value: "second" }]);
  });

  it("treats maxAge 0 as a delete — the ssr package's sign-out signal", () => {
    const store = nativeCookieStorage();
    store.setAll([{ name: "token", value: "live" }]);
    store.setAll([{ name: "token", value: "live", options: { maxAge: 0 } }]);
    // A husk here would read back as a live session after sign-out.
    expect(store.getAll()).toEqual([]);
  });

  it("treats an empty value as a delete too", () => {
    const store = nativeCookieStorage();
    store.setAll([{ name: "token", value: "live" }]);
    store.setAll([{ name: "token", value: "" }]);
    expect(store.getAll()).toEqual([]);
  });

  it("survives corrupt persisted state without throwing", () => {
    localStorage.setItem("biblequest:native-auth-cookies", "{ not json");
    expect(nativeCookieStorage().getAll()).toEqual([]);
  });

  it("ignores entries that are not name/value pairs", () => {
    localStorage.setItem(
      "biblequest:native-auth-cookies",
      JSON.stringify([{ name: "ok", value: "v" }, { nope: 1 }, null, "x"]),
    );
    expect(nativeCookieStorage().getAll()).toEqual([{ name: "ok", value: "v" }]);
  });

  it("clears everything on demand", () => {
    const store = nativeCookieStorage();
    store.setAll([{ name: "token", value: "live" }]);
    clearNativeCookieStorage();
    expect(store.getAll()).toEqual([]);
  });

  it("is supplied to the client only on native", () => {
    expect(nativeAuthClientOptions().cookies).toBeDefined();
    process.env[PLATFORM] = "web";
    // On web, document.cookie works and must stay the source of truth.
    expect(nativeAuthClientOptions().cookies).toBeUndefined();
  });
});

describe("native OAuth callback", () => {
  const runtime = {
    target: "native" as const,
    hostedOrigin: "https://www.biblequest.co",
  };

  it("falls back to the hosted callback when no deep link is configured", () => {
    // Previously this threw before any network call, and the caller swallowed
    // it into a generic "sign-in request failed" notice.
    expect(
      resolveAuthCallbackUrl("/app", { runtime, nativeCallbackUrl: undefined }),
    ).toBe("https://www.biblequest.co/auth/callback?next=%2Fapp");
  });

  it("carries the validated post-auth destination", () => {
    const url = resolveAuthCallbackUrl("/app", { runtime });
    expect(url).toContain("?");
    expect(new URL(url).searchParams.get("next")).toBe("/app");
  });

  it("still honours an explicitly configured deep link", () => {
    expect(
      resolveAuthCallbackUrl("/app", {
        runtime,
        nativeCallbackUrl: "biblequest://auth/callback",
      }),
    ).toBe("biblequest://auth/callback?next=%2Fapp");
  });

  it("rejects a malformed deep link rather than silently falling back", () => {
    expect(() =>
      resolveAuthCallbackUrl("/app", {
        runtime,
        nativeCallbackUrl: "https://evil.test/callback",
      }),
    ).toThrow();
  });
});
