import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildApiUrl,
  buildPublicHref,
  buildPublicUrl,
  validatedApiPath,
} from "@/lib/platform/api";
import { resolveAuthCallbackUrl } from "@/lib/platform/auth";
import {
  notificationCapability,
  type NotificationCapabilityAdapter,
} from "@/lib/platform/notifications";
import {
  purchaseAdapter,
  webCommerceAvailable,
} from "@/lib/platform/purchases";
import {
  PlatformConfigurationError,
  platformRuntime,
  validatedHostedOrigin,
} from "@/lib/platform/runtime";
import {
  copyTextToClipboard,
  shareContent,
  systemShareSupported,
} from "@/lib/platform/share";

const WEB_RUNTIME = { target: "web" } as const;
const NATIVE_RUNTIME = {
  target: "native",
  hostedOrigin: "https://www.biblequest.co",
} as const;

describe("platform runtime and API routing", () => {
  it("keeps web relative and targets one configured native HTTPS origin", () => {
    expect(platformRuntime({})).toEqual({ target: "web" });
    expect(buildApiUrl("/api/bible/chapter?book=john", WEB_RUNTIME)).toBe(
      "/api/bible/chapter?book=john",
    );
    expect(
      buildApiUrl("/api/bible/chapter?book=john", NATIVE_RUNTIME),
    ).toBe("https://www.biblequest.co/api/bible/chapter?book=john");
    expect(
      buildPublicUrl("/verse/john/3/16", {
        runtime: WEB_RUNTIME,
        webOrigin: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3000/verse/john/3/16");
    expect(
      buildPublicUrl("/verse/john/3/16", { runtime: NATIVE_RUNTIME }),
    ).toBe("https://www.biblequest.co/verse/john/3/16");
  });

  it("keeps hosted-page links relative on web and external on native", () => {
    for (const path of ["/", "/about", "/terms", "/privacy"] as const) {
      expect(buildPublicHref(path, WEB_RUNTIME)).toBe(path);
      expect(buildPublicHref(path, NATIVE_RUNTIME)).toBe(
        `https://www.biblequest.co${path}`,
      );
    }
  });

  it("rejects unknown targets and malformed or non-HTTPS hosted origins", () => {
    expect(() =>
      platformRuntime({ appPlatform: "mobile" }),
    ).toThrow(PlatformConfigurationError);
    expect(() =>
      platformRuntime({
        appPlatform: "native",
        nativeHostedOrigin: "http://www.biblequest.co",
      }),
    ).toThrow(PlatformConfigurationError);

    for (const origin of [
      undefined,
      "http://www.biblequest.co",
      "https://user:pass@www.biblequest.co",
      "https://www.biblequest.co/api",
      "https://www.biblequest.co/?mode=native",
      "https://www.biblequest.co/#native",
      "not a url",
    ]) {
      expect(() => validatedHostedOrigin(origin)).toThrow(
        PlatformConfigurationError,
      );
    }
  });

  it("rejects escaped, external, fragmented, and non-API request paths", () => {
    for (const path of [
      "/app",
      "/api",
      "//evil.test/api/private",
      "/api\\evil",
      "/api/private#secret",
      "/api/\u0000private",
      "https://evil.test/api/private",
    ]) {
      expect(() => validatedApiPath(path)).toThrow(PlatformConfigurationError);
    }
  });
});

describe("platform auth callbacks", () => {
  it("retains the same browser callback and validates the next destination", () => {
    expect(
      resolveAuthCallbackUrl("/onboarding", {
        runtime: WEB_RUNTIME,
        webOrigin: "https://www.biblequest.co",
      }),
    ).toBe(
      "https://www.biblequest.co/auth/callback?next=%2Fonboarding",
    );
    expect(
      resolveAuthCallbackUrl("//evil.test", {
        runtime: WEB_RUNTIME,
        webOrigin: "https://www.biblequest.co",
      }),
    ).toBe("https://www.biblequest.co/auth/callback?next=%2Fapp");
  });

  it("permits only the approved native deep-link route", () => {
    expect(
      resolveAuthCallbackUrl("/app/quests", {
        runtime: NATIVE_RUNTIME,
        nativeCallbackUrl: "biblequest://auth/callback",
      }),
    ).toBe("biblequest://auth/callback?next=%2Fapp%2Fquests");

    for (const callback of [
      "https://www.biblequest.co/auth/callback",
      "javascript:alert(1)",
      "otherapp://auth/callback",
      "biblequest://evil/callback",
      "biblequest://auth/other",
      "biblequest://user:pass@auth/callback",
      "biblequest://auth/callback?next=%2Fapp",
      "biblequest://auth/callback#token",
    ]) {
      expect(() =>
        resolveAuthCallbackUrl("/app", {
          runtime: NATIVE_RUNTIME,
          nativeCallbackUrl: callback,
        }),
      ).toThrow(PlatformConfigurationError);
    }
  });
});

describe("privacy-safe share boundary", () => {
  it("uses system share without copying or logging the payload", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(systemShareSupported({ navigator: { share } })).toBe(true);
    await expect(
      shareContent(
        {
          title: "Private title",
          text: "Private reflection body",
          url: "https://www.biblequest.co/app",
        },
        { navigator: { share, clipboard: { writeText } } },
      ),
    ).resolves.toBe("shared");
    expect(writeText).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("copies after a system failure but not after user cancellation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(
      shareContent(
        { text: "Public verse", url: "https://www.biblequest.co/verse/john" },
        {
          navigator: {
            share: vi.fn().mockRejectedValue(new Error("unavailable")),
            clipboard: { writeText },
          },
        },
      ),
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(
      "Public verse\n\nhttps://www.biblequest.co/verse/john",
    );

    writeText.mockClear();
    await expect(
      shareContent(
        { text: "Public verse" },
        {
          navigator: {
            share: vi.fn().mockRejectedValue({ name: "AbortError" }),
            clipboard: { writeText },
          },
        },
      ),
    ).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("offers clipboard directly and returns false when no capability exists", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(
      copyTextToClipboard("Safe public link", {
        navigator: { clipboard: { writeText } },
      }),
    ).resolves.toBe(true);
    await expect(
      copyTextToClipboard("No document", { navigator: {} }),
    ).resolves.toBe(false);
  });

  it("contains restricted legacy clipboard fallbacks without leaking errors", async () => {
    // Model only the textarea surface used by the legacy clipboard fallback.
    const textarea = {
      value: "",
      readOnly: false,
      style: {},
      select: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLTextAreaElement;

    await expect(
      copyTextToClipboard("Public text", {
        navigator: {},
        document: {
          createElement: vi.fn(() => textarea),
          body: {
            appendChild: () => {
              throw new Error("blocked");
            },
          },
        },
      }),
    ).resolves.toBe(false);
  });
});

describe("purchase and notification delegation", () => {
  it("hides every web checkout entry point from a native target", () => {
    expect(webCommerceAvailable(WEB_RUNTIME)).toBe(true);
    expect(webCommerceAvailable(NATIVE_RUNTIME)).toBe(false);
  });

  it("keeps native purchases closed until an explicit adapter is supplied", async () => {
    const closed = purchaseAdapter({ runtime: NATIVE_RUNTIME });
    expect(closed.channel).toBe("native");
    expect(closed.available).toBe(false);
    await expect(closed.purchase("annual")).resolves.toBe("unavailable");
    await expect(closed.restore()).resolves.toBe("unavailable");
    await expect(closed.manage()).resolves.toBe("unavailable");
  });

  it("uses exact server-created Stripe destinations for web actions", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ url: "https://checkout.stripe.com/c/pay" }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({ url: "https://billing.stripe.com/p/session" }),
      );
    const navigate = vi.fn();
    const web = purchaseAdapter({
      runtime: WEB_RUNTIME,
      fetcher,
      navigate,
    });

    await expect(web.purchase("annual")).resolves.toBe("redirected");
    await expect(web.restore()).resolves.toBe("restored");
    await expect(web.manage()).resolves.toBe("redirected");
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      "/api/billing/checkout",
      "/api/billing/refresh",
      "/api/billing/portal",
    ]);
    expect(navigate).toHaveBeenNthCalledWith(
      1,
      "https://checkout.stripe.com/c/pay",
    );
    expect(navigate).toHaveBeenNthCalledWith(
      2,
      "https://billing.stripe.com/p/session",
    );
  });

  it("rejects lookalike Stripe redirects and preserves retry throttling", async () => {
    const navigate = vi.fn();
    const lookalike = purchaseAdapter({
      runtime: WEB_RUNTIME,
      fetcher: vi
        .fn()
        .mockResolvedValue(
          Response.json({ url: "https://checkout.stripe.com.evil.test/pay" }),
        ),
      navigate,
    });
    await expect(lookalike.purchase("monthly")).resolves.toBe("failed");
    expect(navigate).not.toHaveBeenCalled();

    const throttled = purchaseAdapter({
      runtime: WEB_RUNTIME,
      fetcher: vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 429 })),
      navigate,
    });
    await expect(throttled.restore()).resolves.toBe("deferred");
  });

  it("selects native notifications only when an explicit adapter exists", async () => {
    const native: NotificationCapabilityAdapter = {
      channel: "native",
      posture: () => ({
        supported: true,
        iosHomeScreenRequired: false,
      }),
      permission: () => "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    const selected = notificationCapability({
      runtime: NATIVE_RUNTIME,
      native,
    });
    expect(selected).toBe(native);
    await expect(selected.requestPermission()).resolves.toBe("granted");

    const closed = notificationCapability({ runtime: NATIVE_RUNTIME });
    expect(closed.posture().supported).toBe(false);
    await expect(closed.requestPermission()).rejects.toBeInstanceOf(
      PlatformConfigurationError,
    );
  });
});

describe("adapted client call sites", () => {
  /** Reads checked-in client code for regressions around the new central boundaries. */
  function source(path: string): string {
    return readFileSync(join(process.cwd(), path), "utf8");
  }

  it("removes direct relative API fetches from migrated client surfaces", () => {
    const paths = [
      "src/components/bible/ApiBibleViewTracker.tsx",
      "src/components/plus/SupportCheckout.tsx",
      "src/components/settings/SettingsScreen.tsx",
      "src/lib/avatar/client.ts",
      "src/lib/bible/use-preferred-scripture.ts",
      "src/lib/billing/usePlus.ts",
      "src/lib/observability/client-signals.ts",
      "src/lib/push/client.ts",
    ];
    for (const path of paths) {
      expect(source(path)).not.toMatch(/fetch\(\s*[`'"]\/api\//);
    }
  });

  it("routes auth and Scripture sharing through platform helpers", () => {
    expect(source("src/components/account/SignInMethods.tsx")).toContain(
      "resolveAuthCallbackUrl(nextPath)",
    );
    for (const path of [
      "src/components/bible/VerseCard.tsx",
      "src/components/bible/ChapterReader.tsx",
    ]) {
      expect(source(path)).toContain("buildPublicUrl(");
      expect(source(path)).not.toContain("window.location.origin");
    }
    expect(source("src/components/bible/VerseShareSheet.tsx")).not.toMatch(
      /navigator\.(?:share|clipboard)/,
    );
  });

  it("routes app-shell legal links through the hosted-page boundary", () => {
    for (const path of [
      "src/components/settings/SettingsScreen.tsx",
      "src/components/journal/JournalPrivacyNote.tsx",
      "src/components/plus/PlusCta.tsx",
    ]) {
      expect(source(path)).toContain("buildPublicHref(");
      expect(source(path)).not.toMatch(/href=["']\/(?:about|privacy|terms)["']/);
    }
  });

  it("keeps the marketing homepage link web-only in Settings", () => {
    const settings = source("src/components/settings/SettingsScreen.tsx");

    expect(settings).toContain('href={buildPublicHref("/")}');
    expect(settings).toContain("BibleQuest website");
    expect(settings).toMatch(
      /\{!nativeTarget \? \([\s\S]*?BibleQuest website[\s\S]*?\) : null\}/,
    );
  });
});
