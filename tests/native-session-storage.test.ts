import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNativeAuthStorage,
  clearLegacyNativeAuthStorage,
  createNativeAuthStorage,
  nativeSupabaseAuthOptions,
  type NativeAuthStorageBackend,
} from "@/lib/supabase/native-auth-storage";
import { resolveAuthCallbackUrl } from "@/lib/platform/auth";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";

function memoryBackend(): NativeAuthStorageBackend & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
    clear: async () => {
      values.clear();
    },
  };
}

beforeEach(() => {
  process.env[PLATFORM] = "native";
});

afterEach(() => {
  delete process.env[PLATFORM];
  vi.unstubAllGlobals();
});

describe("native Keychain auth storage", () => {
  it("purges the obsolete plaintext cookie blob without loading Keychain", () => {
    const removeItem = vi.fn();

    clearLegacyNativeAuthStorage({ removeItem });

    expect(removeItem).toHaveBeenCalledWith(
      "biblequest:native-auth-cookies",
    );
  });

  it("round-trips Supabase session values through the async adapter", async () => {
    const backend = memoryBackend();
    const storage = createNativeAuthStorage(async () => backend);

    await storage.setItem("sb-proj-auth-token", "session-json");

    expect(await storage.getItem("sb-proj-auth-token")).toBe("session-json");
  });

  it("removes one session value without disturbing another", async () => {
    const backend = memoryBackend();
    const storage = createNativeAuthStorage(async () => backend);
    await storage.setItem("session", "live");
    await storage.setItem("pkce", "verifier");

    await storage.removeItem("session");

    expect(await storage.getItem("session")).toBeNull();
    expect(await storage.getItem("pkce")).toBe("verifier");
  });

  it("clears the isolated auth prefix after confirmed account deletion", async () => {
    const backend = memoryBackend();
    await backend.setItem("session", "live");
    await backend.setItem("pkce", "verifier");

    await clearNativeAuthStorage(async () => backend);

    expect(backend.values.size).toBe(0);
  });

  it("does not initialize a native backend in web builds", async () => {
    process.env[PLATFORM] = "web";
    const load = vi.fn(async () => memoryBackend());

    await clearNativeAuthStorage(load);

    expect(load).not.toHaveBeenCalled();
  });

  it("configures persistent PKCE auth without URL session detection", () => {
    expect(nativeSupabaseAuthOptions().auth).toMatchObject({
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    });
  });
});

describe("native OAuth callback", () => {
  const runtime = {
    target: "native" as const,
    hostedOrigin: "https://www.biblequest.co",
  };

  it("falls back to the hosted callback when no deep link is configured", () => {
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
