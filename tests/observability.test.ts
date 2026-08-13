import { afterEach, describe, expect, it, vi } from "vitest";
import observability from "../config/observability.json";
import {
  classifyOperationalError,
  flushClientSignals,
  reportClientSignal,
  safeClientSignalLog,
  sanitizeClientSignal,
} from "@/lib/observability/client-signals";
import { buildReleaseHealth } from "@/lib/observability/release";
import { POST } from "@/app/api/observability/client/route";
import { GET as GET_HEALTH } from "@/app/api/health/route";

const PRIVATE_MARKERS = [
  "fixture prayer",
  "fixture reflection",
  "fixture scripture",
  "Ada Person",
  "ada@example.test",
  "secret-token",
  "session-cookie",
  "record-123",
  "https://evil.example/path?token=secret",
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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
    this.values.set(key, value);
  }
}

describe("privacy-safe observability contract", () => {
  it("reconstructs only the exact bounded client signal", () => {
    expect(
      sanitizeClientSignal({
        surface: "auth",
        stage: "verify_email",
        outcome: "success",
        category: "ok",
      }),
    ).toEqual({
      surface: "auth",
      stage: "verify_email",
      outcome: "success",
      category: "ok",
    });
    expect(
      sanitizeClientSignal({
        surface: "sync",
        stage: "initial",
        outcome: "failure",
        category: "schema",
      }),
    ).toEqual({
      surface: "sync",
      stage: "initial",
      outcome: "failure",
      category: "schema",
    });
    expect(
      safeClientSignalLog({
        surface: "service_worker",
        stage: "registration",
        outcome: "success",
        category: "ok",
        service_worker_version: observability.serviceWorkerVersion,
      }),
    ).toEqual({
      event: "biblequest_client_signal_v1",
      surface: "service_worker",
      stage: "registration",
      outcome: "success",
      category: "ok",
      service_worker_version: observability.serviceWorkerVersion,
    });
    expect(
      sanitizeClientSignal({
        surface: "service_worker",
        stage: "registration",
        outcome: "success",
        category: "ok",
        service_worker_version: "biblequest-v14",
      }),
    ).not.toBeNull();
    expect(
      sanitizeClientSignal({
        surface: "service_worker",
        stage: "registration",
        outcome: "success",
        category: "ok",
        service_worker_version: PRIVATE_MARKERS[8],
      }),
    ).toBeNull();
  });

  it("deterministically rejects every forbidden data class", () => {
    const forbiddenKeys = [
      "prayer",
      "reflection",
      "scripture_text",
      "name",
      "email",
      "token",
      "cookie",
      "record_id",
      "url",
    ];
    for (const [index, key] of forbiddenKeys.entries()) {
      const candidate = {
        surface: "sync",
        stage: "push",
        outcome: "failure",
        category: "unknown",
        [key]: PRIVATE_MARKERS[index],
      };
      expect(sanitizeClientSignal(candidate), key).toBeNull();
      expect(safeClientSignalLog(candidate), key).toBeNull();
    }
  });

  it("classifies hostile raw errors without retaining their text", () => {
    const rawError = {
      code: "PGRST205",
      message: PRIVATE_MARKERS.join(" | "),
      status: 400,
    };
    const category = classifyOperationalError(rawError, true);
    expect(category).toBe("schema");
    const serialized = JSON.stringify({ category });
    for (const marker of PRIVATE_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("logs only the reconstructed signal and never a hostile request body", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const safeBody = JSON.stringify({
      surface: "auth",
      stage: "session",
      outcome: "success",
      category: "ok",
    });
    const accepted = await POST(
      new Request("https://www.biblequest.co/api/observability/client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.biblequest.co",
        },
        body: safeBody,
      }),
    );
    expect(accepted.status).toBe(202);
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({
        event: "biblequest_client_signal_v1",
        surface: "auth",
        stage: "session",
        outcome: "success",
        category: "ok",
      }),
    );

    info.mockClear();
    const rejected = await POST(
      new Request("https://www.biblequest.co/api/observability/client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.biblequest.co",
        },
        body: JSON.stringify({
          surface: "sync",
          stage: "push",
          outcome: "failure",
          category: "unknown",
          prayer: PRIVATE_MARKERS[0],
        }),
      }),
    );
    expect(rejected.status).toBe(400);
    expect(info).not.toHaveBeenCalled();
  });

  it("rejects a canonical-origin claim sent to a different deployment", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(
      new Request("https://candidate.example.test/api/observability/client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.biblequest.co",
          "Sec-Fetch-Site": "same-origin",
        },
        body: JSON.stringify({
          surface: "auth",
          stage: "session",
          outcome: "success",
          category: "ok",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(info).not.toHaveBeenCalled();
  });

  it("bounds same-origin ingestion without logging the client bucket", async () => {
    vi.stubEnv("VERCEL", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const clientBucket = crypto.randomUUID();
    const request = () =>
      POST(
        new Request("https://www.biblequest.co/api/observability/client", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://www.biblequest.co",
            "Sec-Fetch-Site": "same-origin",
            "X-Forwarded-For": clientBucket,
          },
          body: JSON.stringify({
            surface: "sync",
            stage: "push",
            outcome: "success",
            category: "ok",
          }),
        }),
      );

    for (let index = 0; index < 60; index += 1) {
      expect((await request()).status).toBe(202);
    }
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(JSON.stringify(await limited.json())).not.toContain(clientBucket);
    expect(info).toHaveBeenCalledTimes(60);
    expect(info.mock.calls.flat().join(" ")).not.toContain(clientBucket);
  });

  it("queues only enums offline and flushes without credentials after reconnect", async () => {
    const storage = new TestStorage();
    const browserWindow = Object.assign(new EventTarget(), {
      localStorage: storage,
    });
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("localStorage", storage);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error(PRIVATE_MARKERS.join(" | ")))
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    reportClientSignal({
      surface: "sync",
      stage: "push",
      outcome: "failure",
      category: "offline",
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const queued = storage.getItem("biblequest:operational-signals-v1") ?? "";
    expect(queued).toContain('"category":"offline"');
    for (const marker of PRIVATE_MARKERS) expect(queued).not.toContain(marker);

    await flushClientSignals();
    await flushClientSignals();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.getItem("biblequest:operational-signals-v1")).toBeNull();
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
  });

  it("exposes bounded release posture and redacts malformed environment values", () => {
    const configuredEnvironment = {
      VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
      BIBLEQUEST_ROLLBACK_SHA: "b".repeat(40),
      NEXT_PUBLIC_APP_URL: observability.canonicalOrigin,
      STRIPE_BILLING_MODE: "coming-soon",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-fixture",
      NEXT_PUBLIC_ANALYTICS_ENABLED: "true",
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "www.biblequest.co",
    };
    const health = buildReleaseHealth(configuredEnvironment, false);
    expect(health).toMatchObject({
      release_sha: "a".repeat(40),
      rollback_sha: "b".repeat(40),
      canonical_origin_matches: true,
      auth_posture: "configured",
      analytics_posture: "configured",
      schema_contract: "0036",
      service_worker_version: "biblequest-v26",
      billing_mode: "coming-soon",
      billing_purchases_enabled: false,
      billing_support_enabled: false,
    });

    // The public contract must report the effective guest-only latch even
    // when provider credentials remain available to the deployment.
    expect(buildReleaseHealth(configuredEnvironment).auth_posture).toBe(
      "guest-only",
    );

    const testBilling = buildReleaseHealth({
      NEXT_PUBLIC_APP_URL: observability.canonicalOrigin,
      STRIPE_BILLING_MODE: "test",
      STRIPE_SECRET_KEY: `sk_test_${"a".repeat(24)}`,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_test_${"b".repeat(24)}`,
      STRIPE_WEBHOOK_SECRET: `whsec_${"c".repeat(24)}`,
      STRIPE_PLUS_MONTHLY_PRICE_ID: "price_TestMonthly123",
      STRIPE_PLUS_ANNUAL_PRICE_ID: "price_TestAnnual123",
      STRIPE_PLUS_LIFETIME_PRICE_ID: "price_TestLifetime123",
      BIBLEQUEST_STRIPE_PURCHASES_ENABLED: "true",
      BIBLEQUEST_STRIPE_SUPPORT_ENABLED: "true",
    });
    expect(testBilling).toMatchObject({
      billing_mode: "test",
      billing_purchases_enabled: true,
      billing_support_enabled: true,
    });
    expect(JSON.stringify(testBilling)).not.toMatch(
      /sk_test_|pk_test_|whsec_|price_/,
    );

    const hostile = buildReleaseHealth({
      VERCEL_GIT_COMMIT_SHA: PRIVATE_MARKERS[7],
      BIBLEQUEST_ROLLBACK_SHA: PRIVATE_MARKERS[8],
      NEXT_PUBLIC_APP_URL: PRIVATE_MARKERS[8],
      NEXT_PUBLIC_SUPABASE_URL: PRIVATE_MARKERS[8],
      NEXT_PUBLIC_ANALYTICS_ENABLED: "true",
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: PRIVATE_MARKERS[4],
      STRIPE_BILLING_MODE: PRIVATE_MARKERS[5],
    });
    const serialized = JSON.stringify(hostile);
    expect(hostile.release_sha).toBeNull();
    expect(hostile.rollback_sha).toBeNull();
    expect(hostile.auth_posture).toBe("invalid");
    expect(hostile.analytics_posture).toBe("invalid");
    expect(hostile.billing_mode).toBe("invalid");
    for (const marker of PRIVATE_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("prevents release-health evidence from being cached", async () => {
    const response = GET_HEALTH();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      status: "ok",
      contract: observability.contract,
    });
  });
});
