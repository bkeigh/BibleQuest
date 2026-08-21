import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform/runtime", () => ({
  PlatformConfigurationError: class PlatformConfigurationError extends Error {},
  platformRuntime: () => ({
    target: "native",
    hostedOrigin: "https://www.biblequest.co",
  }),
  validatedWebOrigin: (origin: string) => origin,
}));

import { apiFetch } from "@/native/guest/lib/platform/api";

afterEach(() => vi.unstubAllGlobals());

describe("guest public API transport", () => {
  it("removes caller identity and every BibleQuest authority header", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetcher);

    await apiFetch("/api/bible/chapter", {
      headers: {
        Authorization: "Bearer fixture",
        "X-BibleQuest-Future-Authority": "fixture",
        Accept: "application/json",
      },
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [, init] = fetcher.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(init?.credentials).toBe("omit");
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-biblequest-future-authority")).toBeNull();
    expect(headers.get("accept")).toBe("application/json");
  });
});
