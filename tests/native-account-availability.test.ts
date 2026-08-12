import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "https://abcdefghijklmnopqrst.supabase.co";
const KEY = "fixture-publishable-key";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_NATIVE_ACCOUNT_US_RELEASE_ENABLED", "false");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Build the exact small RPC response accepted by the native beta probe. */
function availabilityResponse(available: boolean) {
  return new Response(
    JSON.stringify({
      contract: "biblequest_native_account_beta_v1",
      available,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("native account-beta availability", () => {
  it("probes anonymously with the exact marker and no credentials", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => availabilityResponse(true));
    const { fetchNativeAccountBetaAvailability } = await import(
      "@/lib/sync/availability"
    );

    await expect(
      fetchNativeAccountBetaAvailability({
        fetcher: fetcher as typeof fetch,
        publishableKey: KEY,
        supabaseOrigin: ORIGIN,
      }),
    ).resolves.toBe(true);

    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      `${ORIGIN}/rest/v1/rpc/native_account_beta_availability`,
    );
    expect(init).toMatchObject({
      body: "{}",
      cache: "no-store",
      credentials: "omit",
      method: "POST",
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("apikey")).toBe(KEY);
    expect(headers.get("x-biblequest-native-account-beta")).toBe("v1");
    expect(headers.has("authorization")).toBe(false);
  });

  it("accepts an authoritative false response without treating it as success", async () => {
    const { fetchNativeAccountBetaAvailability } = await import(
      "@/lib/sync/availability"
    );
    await expect(
      fetchNativeAccountBetaAvailability({
        fetcher: (async () => availabilityResponse(false)) as typeof fetch,
        publishableKey: KEY,
        supabaseOrigin: ORIGIN,
      }),
    ).resolves.toBe(false);
  });

  it("uses the reviewed production contract without a beta marker", async () => {
    vi.stubEnv("NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_NATIVE_ACCOUNT_US_RELEASE_ENABLED", "true");
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          contract: "biblequest_native_account_us_release_v1",
          available: true,
        }),
      ),
    );
    const { fetchNativeAccountBetaAvailability } = await import(
      "@/lib/sync/availability"
    );

    await expect(
      fetchNativeAccountBetaAvailability({
        fetcher: fetcher as typeof fetch,
        publishableKey: KEY,
        supabaseOrigin: ORIGIN,
      }),
    ).resolves.toBe(true);
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get("x-biblequest-native-account-us-release")).toBe("v1");
    expect(headers.has("x-biblequest-native-account-beta")).toBe(false);
  });

  it.each([
    ["extra field", { contract: "biblequest_native_account_beta_v1", available: true, extra: true }],
    ["wrong contract", { contract: "wrong", available: true }],
    ["non-boolean flag", { contract: "biblequest_native_account_beta_v1", available: "true" }],
  ])("fails closed for a %s response", async (_label, body) => {
    const { fetchNativeAccountBetaAvailability } = await import(
      "@/lib/sync/availability"
    );
    await expect(
      fetchNativeAccountBetaAvailability({
        fetcher: (async () =>
          new Response(JSON.stringify(body), { status: 200 })) as typeof fetch,
        publishableKey: KEY,
        supabaseOrigin: ORIGIN,
      }),
    ).rejects.toMatchObject({ code: "native_account_beta_unavailable" });
  });

  it("rejects oversized declared and chunked response bodies", async () => {
    const { fetchNativeAccountBetaAvailability } = await import(
      "@/lib/sync/availability"
    );
    const oversized = "x".repeat(513);
    const declared = new Response(oversized, {
      status: 200,
      headers: { "content-length": "513" },
    });
    const chunked = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(oversized));
          controller.close();
        },
      }),
      { status: 200 },
    );

    for (const response of [declared, chunked]) {
      await expect(
        fetchNativeAccountBetaAvailability({
          fetcher: (async () => response) as typeof fetch,
          publishableKey: KEY,
          supabaseOrigin: ORIGIN,
        }),
      ).rejects.toMatchObject({ code: "native_account_beta_unavailable" });
    }
  });

  it("bounds a stalled probe independently", async () => {
    vi.useFakeTimers();
    const { ACCOUNT_AVAILABILITY_DEADLINE_MS, fetchNativeAccountBetaAvailability } =
      await import("@/lib/sync/availability");
    const probe = fetchNativeAccountBetaAvailability({
      fetcher: (() => new Promise<Response>(() => {})) as typeof fetch,
      publishableKey: KEY,
      supabaseOrigin: ORIGIN,
    });
    const rejected = expect(probe).rejects.toMatchObject({
      code: "request_timeout",
    });

    await vi.advanceTimersByTimeAsync(ACCOUNT_AVAILABILITY_DEADLINE_MS);

    await rejected;
  });

  it("emits no probe or auth traffic in the guest release posture", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_PLATFORM", "native");
    vi.stubEnv("NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const {
      refreshNativeAccountBetaAvailability,
      requireNativeAccountBetaAvailability,
    } = await import("@/lib/sync/availability");

    await expect(refreshNativeAccountBetaAvailability()).resolves.toBe(false);
    await expect(requireNativeAccountBetaAvailability()).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
