import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearExactNativeAuthSession,
  clearNativeAuthStorage,
  clearNativeAuthStorageForUser,
  clearLegacyNativeAuthStorage,
  createNativeAuthStorage,
  nativeSupabaseAuthOptions,
  type NativeAuthStorageBackend,
} from "@/lib/supabase/native-auth-storage";
import { resolveAuthCallbackUrl } from "@/lib/platform/auth";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const SUPABASE_ORIGIN = "https://abcdefghijklmnopqrst.supabase.co";
const SESSION_KEY = "sb-abcdefghijklmnopqrst-auth-token";

function sessionValue(
  userId: string,
  accessToken = "fixture",
  refreshToken = "fixture",
): string {
  return JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: { id: userId },
  });
}

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

  it("preserves a credential that already belongs to another account", async () => {
    const backend = memoryBackend();
    const userB = "20000000-0000-4000-8000-000000000002";
    await backend.setItem(SESSION_KEY, sessionValue(userB));

    await expect(
      clearNativeAuthStorageForUser(
        "10000000-0000-4000-8000-000000000001",
        SUPABASE_ORIGIN,
        async () => backend,
      ),
    ).resolves.toBe("different-user");
    expect(await backend.getItem(SESSION_KEY)).toBe(sessionValue(userB));
  });

  it("queues a newer account write after the expected credential clear", async () => {
    const backend = memoryBackend();
    const storage = createNativeAuthStorage(async () => backend);
    const userA = "30000000-0000-4000-8000-000000000003";
    const userB = "40000000-0000-4000-8000-000000000004";
    await backend.setItem(SESSION_KEY, sessionValue(userA));
    let releaseRead!: () => void;
    const readHeld = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const originalGet = backend.getItem;
    backend.getItem = async (key) => {
      if (key === SESSION_KEY) await readHeld;
      return originalGet(key);
    };

    const clearing = clearNativeAuthStorageForUser(
      userA,
      SUPABASE_ORIGIN,
      async () => backend,
    );
    const installingB = storage.setItem(SESSION_KEY, sessionValue(userB));
    releaseRead();

    await expect(clearing).resolves.toBe("cleared");
    await installingB;
    expect(await backend.getItem(SESSION_KEY)).toBe(sessionValue(userB));
  });

  it("blocks a stale deleted-account refresh from restoring Keychain", async () => {
    const backend = memoryBackend();
    const storage = createNativeAuthStorage(async () => backend);
    const userA = "50000000-0000-4000-8000-000000000005";
    await backend.setItem(SESSION_KEY, sessionValue(userA));

    await clearNativeAuthStorageForUser(
      userA,
      SUPABASE_ORIGIN,
      async () => backend,
    );
    await storage.setItem(SESSION_KEY, sessionValue(userA));

    expect(await backend.getItem(SESSION_KEY)).toBeNull();
  });

  it("removes only an exact non-terminal session and permits a later reinstall", async () => {
    const backend = memoryBackend();
    const storage = createNativeAuthStorage(async () => backend);
    const userA = "60000000-0000-4000-8000-000000000006";
    const oldSession = sessionValue(userA, "access-old", "refresh-old");
    const nextSession = sessionValue(userA, "access-new", "refresh-new");
    await backend.setItem(SESSION_KEY, oldSession);
    await backend.setItem("pkce-verifier", "keep-me");

    await expect(
      clearExactNativeAuthSession(
        {
          userId: userA,
          accessToken: "access-old",
          refreshToken: "refresh-old",
        },
        SUPABASE_ORIGIN,
        async () => backend,
      ),
    ).resolves.toBe("cleared");
    expect(await backend.getItem(SESSION_KEY)).toBeNull();
    expect(await backend.getItem("pkce-verifier")).toBe("keep-me");

    await storage.setItem(SESSION_KEY, nextSession);
    expect(await backend.getItem(SESSION_KEY)).toBe(nextSession);
  });

  it("preserves a newer session during exact non-terminal cleanup", async () => {
    const backend = memoryBackend();
    const userA = "70000000-0000-4000-8000-000000000007";
    const userB = "80000000-0000-4000-8000-000000000008";
    const sessionB = sessionValue(userB, "access-b", "refresh-b");
    await backend.setItem(SESSION_KEY, sessionB);

    await expect(
      clearExactNativeAuthSession(
        {
          userId: userA,
          accessToken: "access-a",
          refreshToken: "refresh-a",
        },
        SUPABASE_ORIGIN,
        async () => backend,
      ),
    ).resolves.toBe("different-session");
    expect(await backend.getItem(SESSION_KEY)).toBe(sessionB);
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
