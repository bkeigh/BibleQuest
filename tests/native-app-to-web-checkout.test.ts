import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeAppToWebBridge } from "@/lib/platform/native-app-to-web";
import {
  exactStripeHostedUrl,
  nativeAppToWebCheckoutEnabled,
  purchaseAdapter,
} from "@/lib/platform/purchases";

const NATIVE_RUNTIME = {
  target: "native",
  hostedOrigin: "https://www.biblequest.co",
} as const;
const NOW = 1_786_447_200_000;
const USER_ID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT = { expectedUserId: USER_ID } as const;
const CHECKOUT_URL =
  "https://checkout.stripe.com/c/pay/cs_test_safe#session-fragment";
const BILLING_URL = "https://billing.stripe.com/p/session/test_safe";

/** Builds the narrow bridge surface so every native edge is observable. */
function bridge(
  overrides: Partial<NativeAppToWebBridge> = {},
): NativeAppToWebBridge {
  return {
    currentStorefront: vi.fn().mockResolvedValue({
      countryCode: "USA",
      checkedAtEpochMilliseconds: NOW,
    }),
    openExternalStripeUrl: vi.fn().mockResolvedValue({ opened: true }),
    cancelExternalStripeOpen: vi.fn().mockResolvedValue(undefined),
    observeStorefrontChanges: vi
      .fn()
      .mockResolvedValue(() => undefined),
    ...overrides,
  };
}

/** Creates the enabled adapter without changing the process-wide build flag. */
function nativeAdapter(options: {
  nativeBridge?: NativeAppToWebBridge;
  fetcher?: (
    path: string,
    init?: RequestInit,
    expectedNativeUserId?: string,
  ) => Promise<Response>;
  identityMatches?: (expectedUserId: string) => Promise<boolean>;
} = {}) {
  return purchaseAdapter({
    runtime: NATIVE_RUNTIME,
    nativeCheckoutEnabled: true,
    nativeBridge: options.nativeBridge ?? bridge(),
    fetcher: options.fetcher,
    nativeIdentityMatches:
      options.identityMatches ?? vi.fn().mockResolvedValue(true),
    now: () => NOW,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("native StoreKit acquisition gate", () => {
  it("accepts only a fresh USA alpha-3 storefront", async () => {
    await expect(nativeAdapter().acquisitionAvailable()).resolves.toBe(true);

    for (const snapshot of [
      { countryCode: "US", checkedAtEpochMilliseconds: NOW },
      { countryCode: "CAN", checkedAtEpochMilliseconds: NOW },
      { countryCode: "USA", checkedAtEpochMilliseconds: NOW - 5_001 },
      { countryCode: "USA", checkedAtEpochMilliseconds: NOW + 1 },
      { countryCode: "USA", checkedAtEpochMilliseconds: "fresh" },
      { checkedAtEpochMilliseconds: NOW },
      null,
    ]) {
      const nativeBridge = bridge({
        currentStorefront: vi.fn().mockResolvedValue(snapshot),
      });
      await expect(
        nativeAdapter({ nativeBridge }).acquisitionAvailable(),
      ).resolves.toBe(false);
    }
  });

  it("fails closed on missing, rejected, or slow StoreKit state", async () => {
    await expect(
      nativeAdapter({
        nativeBridge: bridge({
          currentStorefront: vi.fn().mockRejectedValue(new Error("missing")),
        }),
      }).acquisitionAvailable(),
    ).resolves.toBe(false);

    vi.useFakeTimers();
    const availability = nativeAdapter({
      nativeBridge: bridge({
        currentStorefront: vi.fn(() => new Promise(() => undefined)),
      }),
    }).acquisitionAvailable();
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(availability).resolves.toBe(false);
  });

  it("keeps every non-exact build-flag spelling closed", () => {
    expect(nativeAppToWebCheckoutEnabled("true")).toBe(true);
    for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
      expect(nativeAppToWebCheckoutEnabled(value)).toBe(false);
    }
  });

  it("forwards native storefront invalidations without retaining data", async () => {
    const remove = vi.fn();
    const observeStorefrontChanges = vi.fn().mockResolvedValue(remove);
    const nativeBridge = bridge({ observeStorefrontChanges });
    const listener = vi.fn();

    const stop = await nativeAdapter({ nativeBridge })
      .observeAcquisitionChanges(listener);
    expect(observeStorefrontChanges).toHaveBeenCalledWith(listener);
    stop();
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe("native Checkout action", () => {
  it("sends the allowlisted product through bearer-aware API options", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ url: CHECKOUT_URL }));
    const nativeBridge = bridge();
    const adapter = nativeAdapter({ nativeBridge, fetcher });

    await expect(adapter.purchase("annual", ACCOUNT)).resolves.toBe(
      "redirected",
    );
    expect(fetcher).toHaveBeenCalledOnce();
    const [path, init, expectedUserId] = fetcher.mock.calls[0];
    expect(path).toBe("/api/billing/checkout");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify({ interval: "annual" }),
    });
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(expectedUserId).toBe(USER_ID);
    expect(nativeBridge.currentStorefront).toHaveBeenCalledTimes(2);
    expect(nativeBridge.openExternalStripeUrl).toHaveBeenCalledWith({
      purpose: "checkout",
      requestId: expect.stringMatching(/^bq-open-[0-9a-f]{32}$/),
      url: CHECKOUT_URL,
    });
  });

  it("fails closed when the storefront changes before Safari opens", async () => {
    const currentStorefront = vi
      .fn()
      .mockResolvedValueOnce({
        countryCode: "USA",
        checkedAtEpochMilliseconds: NOW,
      })
      .mockResolvedValueOnce({
        countryCode: "CAN",
        checkedAtEpochMilliseconds: NOW,
      });
    const nativeBridge = bridge({ currentStorefront });
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ url: CHECKOUT_URL }));

    await expect(
      nativeAdapter({ nativeBridge, fetcher }).purchase("monthly", ACCOUNT),
    ).resolves.toBe("unavailable");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(nativeBridge.openExternalStripeUrl).not.toHaveBeenCalled();
  });

  it("does not open an account A Session after the verified account changes", async () => {
    const identityMatches = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const nativeBridge = bridge();
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ url: CHECKOUT_URL }));

    await expect(
      nativeAdapter({
        nativeBridge,
        fetcher,
        identityMatches,
      }).purchase("monthly", ACCOUNT),
    ).resolves.toBe("unavailable");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(nativeBridge.openExternalStripeUrl).not.toHaveBeenCalled();
  });

  it("requires a bounded verified account identity for every native action", async () => {
    const fetcher = vi.fn();
    const adapter = nativeAdapter({ fetcher });

    await expect(
      adapter.purchase("monthly", { expectedUserId: "not-an-account" }),
    ).resolves.toBe("unavailable");
    await expect(
      adapter.restore({ expectedUserId: "not-an-account" }),
    ).resolves.toBe("unavailable");
    await expect(
      adapter.manage({ expectedUserId: "not-an-account" }),
    ).resolves.toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not request a Session outside the US or with an unknown storefront", async () => {
    for (const countryCode of ["CAN", undefined]) {
      const fetcher = vi.fn();
      const nativeBridge = bridge({
        currentStorefront: vi.fn().mockResolvedValue({
          countryCode,
          checkedAtEpochMilliseconds: NOW,
        }),
      });
      await expect(
        nativeAdapter({ nativeBridge, fetcher }).purchase(
          "lifetime",
          ACCOUNT,
        ),
      ).resolves.toBe("unavailable");
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("collapses duplicate taps below React into one Session request", async () => {
    let releaseResponse: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          releaseResponse = resolve;
        }),
    );
    const nativeBridge = bridge();
    const adapter = nativeAdapter({ nativeBridge, fetcher });

    const first = adapter.purchase("monthly", ACCOUNT);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await expect(adapter.purchase("monthly", ACCOUNT)).resolves.toBe(
      "deferred",
    );
    releaseResponse?.(Response.json({ url: CHECKOUT_URL }));
    await expect(first).resolves.toBe("redirected");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("returns safely for offline, timeout, canceled-response, and browser failures", async () => {
    await expect(
      nativeAdapter({
        fetcher: vi.fn().mockRejectedValue(new TypeError("offline")),
      }).purchase("monthly", ACCOUNT),
    ).resolves.toBe("failed");

    await expect(
      nativeAdapter({
        fetcher: vi
          .fn()
          .mockResolvedValue(new Response(null, { status: 499 })),
      }).purchase("monthly", ACCOUNT),
    ).resolves.toBe("failed");

    await expect(
      nativeAdapter({
        nativeBridge: bridge({
          openExternalStripeUrl: vi.fn().mockResolvedValue({ opened: false }),
        }),
        fetcher: vi
          .fn()
          .mockResolvedValue(Response.json({ url: CHECKOUT_URL })),
      }).purchase("monthly", ACCOUNT),
    ).resolves.toBe("failed");

    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    const pending = nativeAdapter({ fetcher }).purchase("monthly", ACCOUNT);
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(pending).resolves.toBe("failed");
  });

  it("cancels on account change even when the transport ignores AbortSignal", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    const adapter = nativeAdapter({ fetcher });
    const pending = adapter.purchase("monthly", {
      expectedUserId: USER_ID,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());

    controller.abort();
    await expect(pending).resolves.toBe("unavailable");
  });

  it("cancels a native open suspended in its final StoreKit check", async () => {
    const controller = new AbortController();
    const cancelExternalStripeOpen = vi.fn().mockResolvedValue(undefined);
    const openExternalStripeUrl = vi.fn(
      (options: { requestId: string }) => {
        void options;
        return new Promise(() => undefined);
      },
    );
    const nativeBridge = bridge({
      cancelExternalStripeOpen,
      openExternalStripeUrl,
    });
    const pending = nativeAdapter({
      nativeBridge,
      fetcher: vi
        .fn()
        .mockResolvedValue(Response.json({ url: CHECKOUT_URL })),
    }).purchase("monthly", {
      expectedUserId: USER_ID,
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(openExternalStripeUrl).toHaveBeenCalledOnce(),
    );
    const requestId = openExternalStripeUrl.mock.calls[0]?.[0].requestId;

    controller.abort();
    await expect(pending).resolves.toBe("unavailable");
    expect(cancelExternalStripeOpen).toHaveBeenCalledWith({ requestId });
  });

  it("bounds a stalled response body and a stalled browser completion", async () => {
    vi.useFakeTimers();
    const stalledBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"url":"'));
      },
    });
    const bodyPending = nativeAdapter({
      fetcher: vi
        .fn()
        .mockResolvedValue(new Response(stalledBody, { status: 200 })),
    }).purchase("monthly", ACCOUNT);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(bodyPending).resolves.toBe("failed");

    const nativeBridge = bridge({
      openExternalStripeUrl: vi.fn(() => new Promise(() => undefined)),
    });
    const openPending = nativeAdapter({
      nativeBridge,
      fetcher: vi
        .fn()
        .mockResolvedValue(Response.json({ url: CHECKOUT_URL })),
    }).purchase("monthly", ACCOUNT);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(openPending).resolves.toBe("failed");
  });
});

describe("provider response and navigation boundary", () => {
  it("allows the official fragment shape and purpose-matched portal host", () => {
    expect(exactStripeHostedUrl(CHECKOUT_URL, "checkout")).toBe(CHECKOUT_URL);
    expect(exactStripeHostedUrl(BILLING_URL, "billing")).toBe(BILLING_URL);
  });

  it.each([
    "http://checkout.stripe.com/c/pay",
    "https://checkout.stripe.com.evil.test/c/pay",
    "https://evil.checkout.stripe.com/c/pay",
    "https://user:pass@checkout.stripe.com/c/pay",
    "https://checkout.stripe.com:443/c/pay",
    "https://checkout.stripe.com./c/pay",
    "https://CHECKOUT.stripe.com/c/pay",
    "https://checkout.stripe.com\\@evil.test/c/pay",
    "https://checkout.stripe.com/c/pay\nhttps://evil.test",
    "https://billing.stripe.com/p/session",
  ])("rejects a Checkout lookalike: %s", (url) => {
    expect(exactStripeHostedUrl(url, "checkout")).toBeNull();
  });

  it.each([
    new Response("not-json", { status: 200 }),
    Response.json({}),
    Response.json({ url: 42 }),
    Response.json({ url: CHECKOUT_URL, extra: true }),
    Response.json({ url: "https://checkout.stripe.com.evil.test/pay" }),
    new Response(JSON.stringify({ url: CHECKOUT_URL }), {
      headers: { "Content-Length": String(12 * 1_024 + 1) },
    }),
    Response.json({
      url: `https://checkout.stripe.com/c/pay/${"a".repeat(8 * 1_024)}`,
    }),
  ])("rejects a malformed or oversized server response", async (response) => {
    const nativeBridge = bridge();
    const adapter = nativeAdapter({
      nativeBridge,
      fetcher: vi.fn().mockResolvedValue(response),
    });
    await expect(adapter.purchase("annual", ACCOUNT)).resolves.toBe("failed");
    expect(nativeBridge.openExternalStripeUrl).not.toHaveBeenCalled();
  });

  it("keeps restore storefront-independent and portal navigation purpose-bound", async () => {
    const currentStorefront = vi.fn().mockResolvedValue({
      countryCode: "USA",
      checkedAtEpochMilliseconds: NOW,
    });
    const nativeBridge = bridge({ currentStorefront });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ url: BILLING_URL }));
    const adapter = nativeAdapter({ nativeBridge, fetcher });

    await expect(adapter.restore(ACCOUNT)).resolves.toBe("restored");
    expect(currentStorefront).not.toHaveBeenCalled();
    await expect(adapter.manage(ACCOUNT)).resolves.toBe("redirected");
    expect(nativeBridge.openExternalStripeUrl).toHaveBeenCalledWith({
      purpose: "billing",
      requestId: expect.stringMatching(/^bq-open-[0-9a-f]{32}$/),
      url: BILLING_URL,
    });
  });
});

describe("native implementation contract", () => {
  it("uses StoreKit and the system browser without location substitutes", () => {
    const swift = readFileSync(
      "ios/App/App/BibleQuestCommercePlugin.swift",
      "utf8",
    );
    const client = readFileSync("src/lib/platform/purchases.ts", "utf8");
    expect(swift).toContain("Storefront.current");
    expect(swift).toContain("Storefront.updates");
    expect(swift).toContain('storefront?.countryCode == "USA"');
    expect(swift).toContain("deadlineUptime");
    expect(swift.indexOf("deadlineUptime =")).toBeLessThan(
      swift.lastIndexOf("Storefront.current"),
    );
    expect(swift.indexOf("systemUptime <= deadlineUptime")).toBeLessThan(
      swift.indexOf("UIApplication.shared.open"),
    );
    expect(swift).toContain("pendingExternalOpens.remove(requestId)");
    expect(swift.indexOf("pendingExternalOpens.remove(requestId)")).toBeLessThan(
      swift.indexOf("UIApplication.shared.open"),
    );
    expect(swift).toContain("UIApplication.shared.open");
    expect(swift).not.toMatch(
      /Locale|NSLocale|CLLocation|timeZone|languageCode|regionCode|WKWebView|SFSafariViewController/,
    );
    expect(client).not.toMatch(/geolocation|billingAddress|enteredCountry|ipAddress/);
  });
});
