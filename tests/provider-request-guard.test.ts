import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as reportBibleView } from "@/app/api/bible/view/route";
import {
  guardProviderRequest,
  rateLimitProviderRequest,
} from "@/lib/bible/provider-request-guard";

function request(
  path: string,
  headers: Record<string, string> = {},
  init: RequestInit = {},
) {
  return new Request(`https://biblequest.test${path}`, {
    ...init,
    headers: {
      "sec-fetch-site": "same-origin",
      "x-vercel-id": "iad1::test",
      "x-forwarded-for": crypto.randomUUID(),
      ...headers,
    },
  });
}

function fumsRequest(headers: Record<string, string> = {}) {
  return request(
    "/api/bible/view",
    { "content-type": "application/json", ...headers },
    {
      method: "POST",
      body: JSON.stringify({
        token: "A_valid-provider-token_1234567890",
        deviceId: "device-id-123456",
        sessionId: "session-id-123456",
      }),
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("licensed Scripture request guard", () => {
  it("rejects cross-site browser calls before they reach a provider", async () => {
    const blocked = guardProviderRequest(
      request("/api/bible/chapter", { "sec-fetch-site": "cross-site" }),
      `cross-site-${crypto.randomUUID()}`,
      { limit: 2, windowMs: 60_000 },
    );

    expect(blocked?.status).toBe(403);
    expect(blocked?.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a bounded 429 response and reopens after the window", () => {
    const ip = crypto.randomUUID();
    const scope = `rate-${crypto.randomUUID()}`;
    const make = () =>
      request("/api/bible/chapter", { "x-forwarded-for": ip });
    const policy = { limit: 2, windowMs: 1_000 };

    expect(guardProviderRequest(make(), scope, policy, 10_000)).toBeNull();
    expect(guardProviderRequest(make(), scope, policy, 10_100)).toBeNull();
    const limited = guardProviderRequest(make(), scope, policy, 10_200);
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("retry-after")).toBe("1");
    expect(guardProviderRequest(make(), scope, policy, 11_001)).toBeNull();
  });

  it("allows top-level public share navigation while still rate limiting it", () => {
    const scope = `public-rate-${crypto.randomUUID()}`;
    const make = () =>
      request("/verse/john/3/16?translation=bsb", {
        "sec-fetch-site": "cross-site",
      });

    expect(
      rateLimitProviderRequest(make(), scope, { limit: 1, windowMs: 60_000 }),
    ).toBeNull();
    const limited = rateLimitProviderRequest(make(), scope, {
      limit: 1,
      windowMs: 60_000,
    });
    expect(limited?.status).toBe(429);
  });
});

describe("API.Bible FUMS relay", () => {
  it("reports a valid view and returns no cacheable payload", async () => {
    const providerFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", providerFetch);

    const response = await reportBibleView(fumsRequest());

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(providerFetch).toHaveBeenCalledOnce();
  });

  it("surfaces provider HTTP failures so the browser can retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    const response = await reportBibleView(fumsRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "report_unavailable",
    });
  });

  it("rejects oversized reports without contacting FUMS", async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);

    const response = await reportBibleView(
      fumsRequest({ "content-length": "5000" }),
    );

    expect(response.status).toBe(413);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
