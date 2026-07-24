import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSnapshot } from "@/lib/questos/import-schema";
import { DEFAULT_SETTINGS } from "@/lib/questos/types";

const QUEUE_KEY = "biblequest:analytics-queue";
const CONSENT_KEY = "biblequest:analytics-consent";

class TestStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

function installBrowser(
  href = "https://biblequest.test/app/journey?email=private#token"
) {
  const storage = new TestStorage();
  const target = new EventTarget();
  const location = new URL(href);
  const browserWindow = Object.assign(target, {
    localStorage: storage,
    location,
    plausible: vi.fn(),
  });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", browserWindow);
  vi.stubGlobal("navigator", {
    doNotTrack: "0",
    globalPrivacyControl: false,
    onLine: true,
  });
  return { browserWindow, storage };
}

async function loadAnalytics(
  config: {
    enabled?: string;
    domain?: string;
    host?: string;
  } = {}
) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", config.enabled ?? "true");
  vi.stubEnv(
    "NEXT_PUBLIC_PLAUSIBLE_DOMAIN",
    config.domain === undefined ? "biblequest.test" : config.domain
  );
  vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_HOST", config.host ?? "");
  return import("@/lib/analytics/events");
}

function response(status = 202) {
  return new Response(null, { status });
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function dispatchConsentStorageEvent(value: string | null) {
  const event = new Event("storage");
  Object.defineProperties(event, {
    key: { value: CONSENT_KEY },
    newValue: { value },
  });
  window.dispatchEvent(event);
}

describe("privacy-first analytics", () => {
  beforeEach(() => {
    installBrowser();
  });

  it("uses only the direct Events API and emits a sanitized payload", async () => {
    installBrowser(
      "https://biblequest.test/app/quests/private-record-id?email=private#token"
    );
    localStorage.setItem(CONSENT_KEY, "1");
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { track } = await loadAnalytics();

    track("sign_in_started", { method: "magic_link", source: "account" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(
      (window as unknown as { plausible: ReturnType<typeof vi.fn> }).plausible
    ).not.toHaveBeenCalled();
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(endpoint).toBe("https://plausible.io/api/event");
    expect(body).toEqual({
      domain: "biblequest.test",
      name: "sign_in_started",
      url: "https://biblequest.test/app/quests/[quest]",
      props: { method: "magic_link", source: "account" },
    });
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(JSON.stringify(body)).not.toMatch(
      /private|email|token|record-id|\?|#/
    );
  });

  it("recognizes the canonical reflection composer without retaining its query", async () => {
    installBrowser(
      "https://biblequest.test/app/prayer/reflection/new?verse=private-reference#draft"
    );
    localStorage.setItem(CONSENT_KEY, "1");
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { track } = await loadAnalytics();

    track("reflection_created");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.url).toBe(
      "https://biblequest.test/app/prayer/reflection/new"
    );
    expect(JSON.stringify(body)).not.toMatch(/private-reference|draft|\?|#/);
  });

  it("silently denies disabled, incomplete, and malformed configurations", async () => {
    const states = [
      { enabled: "false", domain: "biblequest.test" },
      { enabled: "true", domain: "" },
      { enabled: "true", domain: "https://biblequest.test/path" },
      { enabled: "true", domain: "biblequest.test", host: "http://plausible.test" },
      { enabled: "true", domain: "biblequest.test", host: "https://plausible.test/path" },
    ];

    for (const config of states) {
      installBrowser();
      localStorage.setItem(CONSENT_KEY, "1");
      const fetchMock = vi.fn().mockResolvedValue(response());
      vi.stubGlobal("fetch", fetchMock);
      const { track } = await loadAnalytics(config);
      track("prayer_created");
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("requires explicit first-run consent and respects DNT and GPC", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const analytics = await loadAnalytics();

    analytics.track("prayer_created");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    analytics.setAnalyticsConsent(true);
    vi.stubGlobal("navigator", {
      doNotTrack: "1",
      globalPrivacyControl: false,
      onLine: true,
    });
    analytics.track("reflection_created");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubGlobal("navigator", {
      doNotTrack: "0",
      globalPrivacyControl: true,
      onLine: true,
    });
    analytics.track("reflection_created");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown events, extra keys, private text, and invalid bounds", async () => {
    localStorage.setItem(CONSENT_KEY, "1");
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { track } = await loadAnalytics();
    const untypedTrack = track as unknown as (
      event: string,
      props?: unknown
    ) => void;

    untypedTrack("unknown_event", { count: 1 });
    untypedTrack("prayer_created", { body: "fixture-private-marker" });
    untypedTrack("quest_viewed", { category: "fixture-private-marker" });
    untypedTrack("quest_viewed", { category: "prayer", userId: "private" });
    untypedTrack("streak_milestone", { count: 0 });
    untypedTrack("streak_milestone", { count: 1.5 });
    untypedTrack("streak_milestone", { count: 366 });
    untypedTrack("sync_completed", { status: "push" });
    untypedTrack("sign_in_started", {
      method: "phone_otp",
      source: "account",
    });
    untypedTrack("sign_in_started", {
      method: "x".repeat(100),
      source: "account",
    });
    untypedTrack("plus_checkout_opened", {
      interval: "monthly",
      customer: "cus_private",
    });
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();

    if (false) {
      // @ts-expect-error private content is not part of any supported prop type
      track("prayer_created", { body: "fixture-private-marker" });
      // @ts-expect-error category is a closed enum, not arbitrary text
      track("quest_viewed", { category: "fixture-private-marker" });
      track("plus_checkout_opened", {
        interval: "monthly",
        // @ts-expect-error billing analytics accepts no provider identifiers
        customer: "cus_private",
      });
    }
  });

  it("allows only the bounded Plus checkout interval", async () => {
    localStorage.setItem(CONSENT_KEY, "1");
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { track } = await loadAnalytics();

    track("plus_checkout_opened", { interval: "annual" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "plus_checkout_opened",
      props: { interval: "annual" },
    });
    expect(String(init.body)).not.toMatch(/cus_|sub_|price_|card/i);
  });

  it("sends one-time support intent without amount or provider data", async () => {
    localStorage.setItem(CONSENT_KEY, "1");
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { track } = await loadAnalytics();

    track("support_checkout_opened");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "support_checkout_opened",
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("props");
    expect(String(init.body)).not.toMatch(
      /amount|request|session|customer|payment|card/i,
    );
  });

  it("drops hostile persisted events instead of sending private data", async () => {
    localStorage.setItem(CONSENT_KEY, "1");
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([
        {
          name: "prayer_created",
          url: "https://biblequest.test/app/prayer?token=private",
          props: { body: "fixture-private-marker" },
        },
      ])
    );
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { flushAnalyticsQueue } = await loadAnalytics();

    await flushAnalyticsQueue();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("caps the sanitized offline queue at 50 events", async () => {
    localStorage.setItem(CONSENT_KEY, "1");
    const fetchMock = vi.fn().mockRejectedValue(new Error("fixture-offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { track } = await loadAnalytics();

    for (let i = 0; i < 55; i++) track("prayer_created");

    await vi.waitFor(() => {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as unknown[];
      expect(queue).toHaveLength(50);
    });
    expect(localStorage.getItem(QUEUE_KEY)).not.toContain("fixture-offline");
  });

  it("retries offline events and removes them only after success", async () => {
    localStorage.setItem(CONSENT_KEY, "1");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("fixture-offline"))
      .mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const { flushAnalyticsQueue, track } = await loadAnalytics();

    track("prayer_created");
    await vi.waitFor(() => expect(localStorage.getItem(QUEUE_KEY)).not.toBeNull());
    await flushAnalyticsQueue();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("clears the queue and stops when consent is revoked mid-flush", async () => {
    localStorage.setItem(CONSENT_KEY, "1");
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([
        { name: "prayer_created", url: "https://biblequest.test/app/prayer" },
        { name: "reflection_created", url: "https://biblequest.test/app/reflection" },
      ])
    );
    let resolveRequest!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const analytics = await loadAnalytics();

    const flushing = analytics.flushAnalyticsQueue();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    analytics.setAnalyticsConsent(false);
    resolveRequest(response());
    await flushing;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("propagates opt-out across tabs and prevents later sends", async () => {
    localStorage.setItem(CONSENT_KEY, "1");
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([
        { name: "prayer_created", url: "https://biblequest.test/app/prayer" },
      ])
    );
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
    const analytics = await loadAnalytics();
    const subscriber = vi.fn();
    analytics.subscribeToAnalyticsConsent(subscriber);

    localStorage.setItem(CONSENT_KEY, "0");
    dispatchConsentStorageEvent("0");
    analytics.track("prayer_created");
    await settle();

    expect(subscriber).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    const nextSession = await loadAnalytics();
    nextSession.track("prayer_created");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails safely when storage is unavailable", async () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const target = new EventTarget();
    vi.stubGlobal(
      "window",
      Object.assign(target, {
        localStorage: throwingStorage,
        location: new URL("https://biblequest.test/app"),
      })
    );
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    const analytics = await loadAnalytics();

    expect(() => analytics.setAnalyticsConsent(true)).not.toThrow();
    expect(() => analytics.track("prayer_created")).not.toThrow();
    await expect(analytics.flushAnalyticsQueue()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults and imported journeys to analytics off", () => {
    expect(DEFAULT_SETTINGS.analyticsConsent).toBe(false);
    const parsed = parseSnapshot(
      JSON.stringify({ settings: { analyticsConsent: true } })
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.settings).not.toHaveProperty("analyticsConsent");
  });
});
