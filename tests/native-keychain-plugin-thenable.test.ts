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
const KEY = "sb-abcdefghijklmnopqrst-auth-token";

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
  vi.unstubAllEnvs();
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
});
