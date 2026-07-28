import { describe, expect, it, vi } from "vitest";
import {
  SYNTHETIC_HEALTH_CONTRACT,
  SYNTHETIC_ISSUE_MARKER,
  runSyntheticHealth,
  syntheticHealthMarkdown,
  syntheticIncidentAction,
  syntheticIncidentBody,
} from "../scripts/lib/synthetic-health.mjs";

const CANONICAL = "https://www.biblequest.co";
const SUPABASE = "https://fixture.supabase.co";
const RELEASE = "a".repeat(40);
const PRIVATE_MARKER = "private-prayer-fixture-do-not-report";
const STATIC_ASSET = "/_next/static/chunks/app-fixture.js";

function health(overrides = {}) {
  return {
    status: "ok",
    app: "biblequest",
    contract: "biblequest_observability_v1",
    release_sha: RELEASE,
    rollback_sha: null,
    canonical_origin: CANONICAL,
    canonical_origin_matches: true,
    auth_posture: "configured",
    analytics_posture: "disabled",
    schema_contract: "0029",
    content_contract: "seed-manifest-v1",
    service_worker_version: "biblequest-v21",
    billing_mode: "coming-soon",
    billing_purchases_enabled: false,
    billing_support_enabled: false,
    ...overrides,
  };
}

function html({ canonical = true } = {}) {
  return `<!doctype html><html lang="en"><head><title>BibleQuest — fixture</title><link rel="canonical" href="${
    canonical ? `${CANONICAL}/` : "https://wrong.example/"
  }"><link rel="manifest" href="/manifest.webmanifest"><script src="${STATIC_ASSET}"></script></head><body>BibleQuest</body></html>`;
}

function response(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers },
  );
}

function healthyRoutes(): Map<string, Response> {
  return new Map([
    [
      "https://biblequest.co/",
      response("", 308, { location: `${CANONICAL}/` }),
    ],
    [`${CANONICAL}/api/health`, response(health())],
    [`${CANONICAL}/`, response(html())],
    [`${CANONICAL}/app`, response(html())],
    [
      `${CANONICAL}/manifest.webmanifest`,
      response({
        name: "BibleQuest",
        start_url: "/app",
        display: "standalone",
        icons: [{}, {}, {}],
      }),
    ],
    [
      `${CANONICAL}/sw.js`,
      response('const CACHE_VERSION = "biblequest-v21";', 200, {
        "cache-control": "no-cache, no-store, must-revalidate",
      }),
    ],
    [`${CANONICAL}${STATIC_ASSET}`, response("fixture bundle")],
    [
      `${SUPABASE}/rest/v1/daily_verses?select=id&limit=1`,
      response([{ id: "11111111-1111-4111-8111-111111111111" }]),
    ],
    [
      `${SUPABASE}/auth/v1/settings`,
      response({ external: { email: true, google: true, phone: false } }),
    ],
  ]);
}

function fixtureFetch(
  routes: Map<string, Response>,
  custom: Record<
    string,
    (init: RequestInit) => Response | Promise<Response>
  > = {},
) {
  return vi.fn(async (input, init = {}) => {
    const url = String(input);
    if (custom[url]) return custom[url](init);
    const found = routes.get(url);
    if (!found) return response("missing fixture", 500);
    return found.clone();
  });
}

function environment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    BIBLEQUEST_MONITOR_SUPABASE_URL: SUPABASE,
    BIBLEQUEST_MONITOR_SUPABASE_ANON_KEY: "fixture-publishable-key-123456789",
    BIBLEQUEST_MONITOR_EXPECTED_SHA: RELEASE,
    BIBLEQUEST_MONITOR_EXPECTED_AUTH_POSTURE: "configured",
    BIBLEQUEST_MONITOR_EXPECTED_BILLING_MODE: "coming-soon",
  };
}

describe("daily synthetic health", () => {
  it("passes a healthy production fixture with sanitized reports", async () => {
    const report = await runSyntheticHealth({
      env: environment(),
      fetchImpl: fixtureFetch(healthyRoutes()),
      retries: 0,
      now: new Date("2026-07-24T12:00:00.000Z"),
    });

    expect(report).toMatchObject({
      contract: SYNTHETIC_HEALTH_CONTRACT,
      ok: true,
      release_sha: RELEASE,
      summary: { failed: 0 },
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "release_health", ok: true }),
        expect.objectContaining({ id: "canonical_redirect", ok: true }),
        expect.objectContaining({ id: "supabase_public_content", ok: true }),
        expect.objectContaining({
          id: "vercel_runtime_errors",
          ok: true,
          detail: "not_configured",
        }),
      ]),
    );
    expect(JSON.stringify(report)).not.toContain(CANONICAL);
    expect(JSON.stringify(report)).not.toContain(SUPABASE);
    expect(syntheticHealthMarkdown(report)).toContain(
      "response bodies, credentials, user records",
    );
  });

  it("pins deployed contracts independently from the checkout on main", async () => {
    const routes = healthyRoutes();
    routes.set(
      `${CANONICAL}/api/health`,
      response(
        health({
          schema_contract: "0026",
          content_contract: "deployed-seed-v1",
          service_worker_version: "biblequest-v20",
        }),
      ),
    );
    const report = await runSyntheticHealth({
      env: {
        ...environment(),
        BIBLEQUEST_MONITOR_EXPECTED_SCHEMA_CONTRACT: "0026",
        BIBLEQUEST_MONITOR_EXPECTED_CONTENT_CONTRACT: "deployed-seed-v1",
        BIBLEQUEST_MONITOR_EXPECTED_SERVICE_WORKER_VERSION: "biblequest-v20",
      },
      fetchImpl: fixtureFetch(routes),
      retries: 0,
    });

    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "release_health", ok: true }),
    );
  });

  it("accepts an equivalent root canonical and HEAD representation length", async () => {
    const routes = healthyRoutes();
    routes.set(
      `${CANONICAL}/`,
      response(html().replace(`${CANONICAL}/`, CANONICAL)),
    );
    const report = await runSyntheticHealth({
      env: environment(),
      fetchImpl: fixtureFetch(routes, {
        [`${CANONICAL}${STATIC_ASSET}`]: (init) => {
          expect(init.method).toBe("HEAD");
          return response("", 200, { "content-length": "1048576" });
        },
      }),
      retries: 0,
    });

    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "public_home", ok: true }),
        expect.objectContaining({ id: "static_assets", ok: true }),
      ]),
    );
  });

  it("fails simulated bad schema and canonical metadata", async () => {
    const routes = healthyRoutes();
    routes.set(
      `${CANONICAL}/api/health`,
      response(health({ schema_contract: "9999" })),
    );
    routes.set(`${CANONICAL}/`, response(html({ canonical: false })));
    const report = await runSyntheticHealth({
      env: environment(),
      fetchImpl: fixtureFetch(routes),
      retries: 0,
    });

    expect(report.ok).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "release_health",
          ok: false,
          detail: "release_contract_mismatch",
        }),
        expect.objectContaining({
          id: "public_home",
          ok: false,
          detail: "canonical_mismatch",
        }),
      ]),
    );
  });

  it("fails a canonical redirect mismatch", async () => {
    const routes = healthyRoutes();
    routes.set(
      "https://biblequest.co/",
      response("", 308, { location: "https://wrong.example/" }),
    );
    const report = await runSyntheticHealth({
      env: environment(),
      fetchImpl: fixtureFetch(routes),
      retries: 0,
    });

    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "canonical_redirect",
        ok: false,
        detail: "canonical_mismatch",
      }),
    );
  });

  it("fails bounded timeout and 500 responses without leaking bodies", async () => {
    const timeoutRoutes = healthyRoutes();
    const timeoutFetch = fixtureFetch(timeoutRoutes, {
      [`${CANONICAL}/api/health`]: ({ signal }) =>
        new Promise<Response>((_, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });
    const timeoutReport = await runSyntheticHealth({
      env: environment(),
      fetchImpl: timeoutFetch,
      timeoutMs: 5,
      retries: 0,
    });
    expect(timeoutReport.checks).toContainEqual(
      expect.objectContaining({
        id: "release_health",
        ok: false,
        detail: "timeout",
      }),
    );

    const failureRoutes = healthyRoutes();
    failureRoutes.set(
      `${CANONICAL}/api/health`,
      response(`${PRIVATE_MARKER} ${"sk_test_secret"}`, 500),
    );
    const failureReport = await runSyntheticHealth({
      env: environment(),
      fetchImpl: fixtureFetch(failureRoutes),
      retries: 0,
    });
    const serialized = JSON.stringify(failureReport);
    expect(serialized).not.toContain(PRIVATE_MARKER);
    expect(serialized).not.toContain("sk_test_secret");
    expect(failureReport.checks).toContainEqual(
      expect.objectContaining({
        id: "release_health",
        ok: false,
        status: 500,
      }),
    );
  });
});

describe("synthetic incident deduplication", () => {
  const passing = {
    ok: true,
    generated_at: "2026-07-24T12:00:00.000Z",
    release_sha: RELEASE,
    checks: [],
  };
  const failing = {
    ...passing,
    ok: false,
    checks: [
      {
        id: "release_health",
        ok: false,
        detail: "release_contract_mismatch",
        status: 200,
        latency_ms: 50,
      },
    ],
  };
  const issue = {
    number: 42,
    body: `${SYNTHETIC_ISSUE_MARKER}\nExisting incident`,
  };

  it("creates once, updates the same issue, then marks recovery", () => {
    expect(syntheticIncidentAction(failing, [])).toEqual({
      action: "create",
      issue: null,
    });
    expect(syntheticIncidentAction(failing, [issue])).toEqual({
      action: "update",
      issue,
    });
    expect(syntheticIncidentAction(passing, [issue])).toEqual({
      action: "recover",
      issue,
    });
    expect(syntheticIncidentAction(passing, [])).toEqual({
      action: "none",
      issue: null,
    });
  });

  it("renders only bounded failure fields into the issue", () => {
    const body = syntheticIncidentBody(failing);
    expect(body).toContain(SYNTHETIC_ISSUE_MARKER);
    expect(body).toContain("release_contract_mismatch");
    expect(body).not.toContain(PRIVATE_MARKER);
  });

  it("pins daily schedule, report retention, and issue permissions", async () => {
    const workflow = await import("node:fs/promises").then(({ readFile }) =>
      readFile(".github/workflows/daily-synthetic-health.yml", "utf8"),
    );
    expect(workflow).toContain('cron: "23 11 * * *"');
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("retention-days: 14");
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).not.toMatch(/echo[^\\n]*(TOKEN|KEY|SECRET)/i);
  });
});
