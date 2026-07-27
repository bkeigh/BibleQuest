import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const SHA = /^[0-9a-f]{40}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SYNTHETIC_HEALTH_CONTRACT = "biblequest_synthetic_health_v1";
export const SYNTHETIC_ISSUE_MARKER =
  "<!-- biblequest-synthetic-health-v1 -->";

/** Loads the same fixed release expectations used by the application. */
async function releaseExpectations() {
  const raw = await readFile(resolve(ROOT, "config", "observability.json"), "utf8");
  return JSON.parse(raw);
}

/** Sleeps between bounded retries without tying tests to real timers. */
function defaultSleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

/** Reads a response with a hard byte ceiling before parsing or inspection. */
async function boundedText(response, maximumBytes, timeoutMs = 5_000) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel();
    throw new Error("response_too_large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let timeout;
  const bodyTimeout = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      void reader.cancel();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([
        reader.read(),
        bodyTimeout,
      ]);
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) throw new Error("response_too_large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Fetches with timeout and retries only transient network/provider failures. */
export async function fetchWithPolicy(
  url,
  init = {},
  {
    fetchImpl = fetch,
    timeoutMs = 5_000,
    retries = 1,
    sleep = defaultSleep,
  } = {},
) {
  let lastError = "network_error";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();
    try {
      const response = await fetchImpl(url, {
        ...init,
        redirect: init.redirect ?? "manual",
        signal: controller.signal,
      });
      const elapsedMs = Math.round(performance.now() - started);
      if (
        attempt < retries &&
        (response.status === 408 ||
          response.status === 429 ||
          response.status >= 500)
      ) {
        await response.body?.cancel();
        await sleep(100 * (attempt + 1));
        continue;
      }
      return { response, elapsedMs, attempts: attempt + 1 };
    } catch (error) {
      lastError =
        error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "network_error";
      if (attempt < retries) {
        await sleep(100 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError);
}

function check(id, ok, fields = {}) {
  return {
    id,
    ok,
    status: Number.isInteger(fields.status) ? fields.status : null,
    latency_ms: Number.isInteger(fields.latencyMs) ? fields.latencyMs : null,
    attempts: Number.isInteger(fields.attempts) ? fields.attempts : null,
    detail: typeof fields.detail === "string" ? fields.detail : ok ? "ok" : "failed",
  };
}

function failedCheck(id, error) {
  const detail =
    error instanceof Error &&
    ["timeout", "network_error", "response_too_large"].includes(error.message)
      ? error.message
      : "invalid_response";
  return check(id, false, { detail });
}

async function inspectResponse(
  id,
  url,
  inspect,
  options,
  maximumBytes = MAX_TEXT_BYTES,
  init = {},
) {
  try {
    const { response, elapsedMs, attempts } = await fetchWithPolicy(
      url,
      init,
      options,
    );
    // HEAD exposes representation metadata without a response body to inspect.
    const body =
      init.method?.toUpperCase() === "HEAD"
        ? ""
        : await boundedText(response, maximumBytes);
    const verdict = inspect(response, body);
    const withinLatency =
      !options.maximumLatencyMs || elapsedMs <= options.maximumLatencyMs;
    return check(id, verdict.ok && withinLatency, {
      status: response.status,
      latencyMs: elapsedMs,
      attempts,
      detail:
        verdict.ok && !withinLatency ? "latency_exceeded" : verdict.detail,
    });
  } catch (error) {
    return failedCheck(id, error);
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Accepts only the canonical origin's exact root URL. */
function exactCanonical(html, canonicalOrigin) {
  const match = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i,
  );
  if (!match?.[1]) return false;
  try {
    const canonical = new URL(match[1]);
    return (
      canonical.origin === canonicalOrigin &&
      canonical.pathname === "/" &&
      !canonical.search &&
      !canonical.hash
    );
  } catch {
    return false;
  }
}

function staticAssetPaths(html, canonicalOrigin) {
  const paths = new Set();
  for (const match of html.matchAll(
    /(?:src|href)=["']([^"']*\/_next\/static\/[^"'?#]+)["']/g,
  )) {
    try {
      const url = new URL(match[1], canonicalOrigin);
      if (url.origin === canonicalOrigin) paths.add(url.pathname);
    } catch {
      // Ignore malformed markup; the app-bootstrap check will still fail.
    }
    if (paths.size >= 3) break;
  }
  return [...paths];
}

async function fetchHome(fetchOptions, canonicalOrigin) {
  try {
    const result = await fetchWithPolicy(`${canonicalOrigin}/`, {}, fetchOptions);
    const body = await boundedText(result.response, MAX_TEXT_BYTES);
    const homeCheck = check(
      "public_home",
      result.response.status === 200 &&
        result.elapsedMs <= 4_000 &&
        exactCanonical(body, canonicalOrigin) &&
        /<title>[^<]*BibleQuest[^<]*<\/title>/i.test(body),
      {
        status: result.response.status,
        latencyMs: result.elapsedMs,
        attempts: result.attempts,
        detail:
          result.response.status !== 200
            ? "unexpected_status"
            : result.elapsedMs > 4_000
              ? "latency_exceeded"
            : !exactCanonical(body, canonicalOrigin)
              ? "canonical_mismatch"
              : "ok",
      },
    );
    return { homeCheck, body };
  } catch (error) {
    return { homeCheck: failedCheck("public_home", error), body: "" };
  }
}

async function supabaseChecks(env, fetchOptions) {
  const url = env.BIBLEQUEST_MONITOR_SUPABASE_URL?.trim();
  const key = env.BIBLEQUEST_MONITOR_SUPABASE_ANON_KEY?.trim();
  const criticalOptions = {
    ...fetchOptions,
    maximumLatencyMs: Math.min(fetchOptions.timeoutMs, 2_500),
  };
  if (!url || !key) {
    return [
      check("supabase_public_content", false, {
        detail: "monitor_configuration_missing",
      }),
      check("supabase_auth_posture", false, {
        detail: "monitor_configuration_missing",
      }),
    ];
  }

  let origin;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      !key ||
      key.length < 20
    ) {
      throw new Error("invalid");
    }
    origin = parsed.origin;
  } catch {
    return [
      check("supabase_public_content", false, {
        detail: "monitor_configuration_invalid",
      }),
      check("supabase_auth_posture", false, {
        detail: "monitor_configuration_invalid",
      }),
    ];
  }

  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    accept: "application/json",
  };
  const publicContent = await inspectResponse(
    "supabase_public_content",
    `${origin}/rest/v1/daily_verses?select=id&limit=1`,
    (response, body) => {
      const value = safeJson(body);
      const ok =
        response.status === 200 &&
        Array.isArray(value) &&
        value.length === 1 &&
        UUID.test(String(value[0]?.id));
      return { ok, detail: ok ? "ok" : "public_query_failed" };
    },
    criticalOptions,
    MAX_JSON_BYTES,
    { headers },
  );
  const expectedAuth =
    env.BIBLEQUEST_MONITOR_EXPECTED_AUTH_POSTURE?.trim() || "configured";
  const auth = await inspectResponse(
    "supabase_auth_posture",
    `${origin}/auth/v1/settings`,
    (response, body) => {
      const value = safeJson(body);
      const configured =
        response.status === 200 &&
        value &&
        typeof value === "object" &&
        value.external &&
        typeof value.external === "object" &&
        value.external.email === true &&
        value.external.google === true &&
        value.external.phone !== true;
      const ok =
        expectedAuth === "configured"
          ? configured
          : expectedAuth === "guest-only" && response.status === 200;
      return { ok, detail: ok ? "ok" : "auth_posture_mismatch" };
    },
    criticalOptions,
    MAX_JSON_BYTES,
    { headers },
  );
  return [publicContent, auth];
}

async function vercelRuntimeCheck(env, fetchOptions, now) {
  const project = env.BIBLEQUEST_MONITOR_VERCEL_PROJECT_ID?.trim();
  const team = env.BIBLEQUEST_MONITOR_VERCEL_TEAM_ID?.trim();
  const token = env.BIBLEQUEST_MONITOR_VERCEL_TOKEN?.trim();
  if (!project && !team && !token) {
    return check("vercel_runtime_errors", true, { detail: "not_configured" });
  }
  if (!project || !team || !token) {
    return check("vercel_runtime_errors", false, {
      detail: "monitor_configuration_incomplete",
    });
  }

  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  try {
    const deploymentsUrl = new URL("https://api.vercel.com/v6/deployments");
    deploymentsUrl.searchParams.set("projectId", project);
    deploymentsUrl.searchParams.set("teamId", team);
    deploymentsUrl.searchParams.set("target", "production");
    deploymentsUrl.searchParams.set("state", "READY");
    deploymentsUrl.searchParams.set("limit", "1");
    const deploymentResult = await fetchWithPolicy(
      deploymentsUrl,
      { headers },
      fetchOptions,
    );
    const deploymentBody = await boundedText(
      deploymentResult.response,
      MAX_JSON_BYTES,
    );
    const deploymentJson = safeJson(deploymentBody);
    const deploymentId = deploymentJson?.deployments?.[0]?.uid;
    if (
      deploymentResult.response.status !== 200 ||
      typeof deploymentId !== "string" ||
      !/^dpl_[A-Za-z0-9]+$/.test(deploymentId)
    ) {
      return check("vercel_runtime_errors", false, {
        status: deploymentResult.response.status,
        latencyMs: deploymentResult.elapsedMs,
        attempts: deploymentResult.attempts,
        detail: "deployment_lookup_failed",
      });
    }

    // Deployment events are reduced to an aggregate count; log text is dropped.
    const eventsUrl = new URL(
      `https://api.vercel.com/v3/deployments/${deploymentId}/events`,
    );
    eventsUrl.searchParams.set("teamId", team);
    eventsUrl.searchParams.set("direction", "backward");
    eventsUrl.searchParams.set("limit", "100");
    eventsUrl.searchParams.set("statusCode", "5xx");
    eventsUrl.searchParams.set("since", String(now.getTime() - 24 * 60 * 60 * 1000));
    eventsUrl.searchParams.set("until", String(now.getTime()));
    const eventResult = await fetchWithPolicy(
      eventsUrl,
      { headers },
      fetchOptions,
    );
    const eventBody = await boundedText(eventResult.response, MAX_TEXT_BYTES);
    const events = safeJson(eventBody);
    const errorCount = Array.isArray(events)
      ? events.filter((event) => {
          const status =
            event?.payload?.statusCode ?? event?.payload?.proxy?.statusCode;
          return Number.isInteger(status) && status >= 500;
        }).length
      : null;
    const ok = eventResult.response.status === 200 && errorCount === 0;
    return check("vercel_runtime_errors", ok, {
      status: eventResult.response.status,
      latencyMs:
        deploymentResult.elapsedMs + eventResult.elapsedMs,
      attempts: deploymentResult.attempts + eventResult.attempts,
      detail:
        errorCount === null
          ? "runtime_log_query_failed"
          : errorCount === 0
            ? "ok"
            : "runtime_5xx_detected",
    });
  } catch (error) {
    return failedCheck("vercel_runtime_errors", error);
  }
}

/** Runs only non-destructive, allowlisted production checks. */
export async function runSyntheticHealth({
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
  timeoutMs = 5_000,
  retries = 1,
  sleep = defaultSleep,
} = {}) {
  const expectations = await releaseExpectations();
  const canonicalOrigin = expectations.canonicalOrigin;
  const apexOrigin = canonicalOrigin.replace("://www.", "://");
  const fetchOptions = { fetchImpl, timeoutMs, retries, sleep };
  const checks = [];
  let releaseSha = null;

  checks.push(
    await inspectResponse(
      "canonical_redirect",
      `${apexOrigin}/`,
      (response) => {
        const location = response.headers.get("location");
        const ok =
          [301, 308].includes(response.status) &&
          location === `${canonicalOrigin}/`;
        return { ok, detail: ok ? "ok" : "canonical_mismatch" };
      },
      fetchOptions,
      1024,
    ),
  );

  try {
    const result = await fetchWithPolicy(
      `${canonicalOrigin}/api/health`,
      {},
      fetchOptions,
    );
    const body = await boundedText(result.response, MAX_JSON_BYTES);
    const health = safeJson(body);
    const expectedBilling =
      env.BIBLEQUEST_MONITOR_EXPECTED_BILLING_MODE?.trim() || "coming-soon";
    const expectedBillingPurchases =
      env.BIBLEQUEST_MONITOR_EXPECTED_BILLING_PURCHASES_ENABLED === "true";
    const expectedBillingSupport =
      env.BIBLEQUEST_MONITOR_EXPECTED_BILLING_SUPPORT_ENABLED === "true";
    const expectedSha = env.BIBLEQUEST_MONITOR_EXPECTED_SHA?.trim().toLowerCase();
    // Pin deploy-owned contracts separately from the newer checkout on main.
    const expectedSchema =
      env.BIBLEQUEST_MONITOR_EXPECTED_SCHEMA_CONTRACT?.trim() ||
      expectations.schemaContract;
    const expectedContent =
      env.BIBLEQUEST_MONITOR_EXPECTED_CONTENT_CONTRACT?.trim() ||
      expectations.contentContract;
    const expectedServiceWorker =
      env.BIBLEQUEST_MONITOR_EXPECTED_SERVICE_WORKER_VERSION?.trim() ||
      expectations.serviceWorkerVersion;
    releaseSha =
      typeof health?.release_sha === "string" && SHA.test(health.release_sha)
        ? health.release_sha
        : null;
    const ok =
      result.response.status === 200 &&
      result.elapsedMs <= 2_500 &&
      health?.status === "ok" &&
      health?.app === "biblequest" &&
      health?.contract === expectations.contract &&
      health?.canonical_origin === canonicalOrigin &&
      health?.canonical_origin_matches === true &&
      health?.schema_contract === expectedSchema &&
      health?.content_contract === expectedContent &&
      health?.service_worker_version === expectedServiceWorker &&
      health?.billing_mode === expectedBilling &&
      health?.billing_purchases_enabled === expectedBillingPurchases &&
      health?.billing_support_enabled === expectedBillingSupport &&
      health?.auth_posture ===
        (env.BIBLEQUEST_MONITOR_EXPECTED_AUTH_POSTURE?.trim() || "configured") &&
      releaseSha !== null &&
      Boolean(expectedSha) &&
      SHA.test(expectedSha) &&
      releaseSha === expectedSha;
    checks.push(
      check("release_health", ok, {
        status: result.response.status,
        latencyMs: result.elapsedMs,
        attempts: result.attempts,
        detail:
          result.response.status === 200 && result.elapsedMs > 2_500
            ? "latency_exceeded"
            : ok
              ? "ok"
              : "release_contract_mismatch",
      }),
    );
  } catch (error) {
    checks.push(failedCheck("release_health", error));
  }

  const { homeCheck, body: homeBody } = await fetchHome(
    fetchOptions,
    canonicalOrigin,
  );
  checks.push(homeCheck);

  let appBody = "";
  try {
    const result = await fetchWithPolicy(
      `${canonicalOrigin}/app`,
      {},
      fetchOptions,
    );
    appBody = await boundedText(result.response, MAX_TEXT_BYTES);
    const ok =
      result.response.status === 200 &&
      result.elapsedMs <= 4_000 &&
      /<html[^>]+lang=["']en["']/i.test(appBody) &&
      /manifest\.webmanifest/i.test(appBody) &&
      /BibleQuest/i.test(appBody);
    checks.push(
      check("app_bootstrap", ok, {
        status: result.response.status,
        latencyMs: result.elapsedMs,
        attempts: result.attempts,
        detail:
          result.response.status === 200 && result.elapsedMs > 4_000
            ? "latency_exceeded"
            : ok
              ? "ok"
              : "app_bootstrap_failed",
      }),
    );
  } catch (error) {
    checks.push(failedCheck("app_bootstrap", error));
  }

  checks.push(
    await inspectResponse(
      "web_manifest",
      `${canonicalOrigin}/manifest.webmanifest`,
      (response, body) => {
        const manifest = safeJson(body);
        const ok =
          response.status === 200 &&
          manifest?.name === "BibleQuest" &&
          manifest?.start_url === "/app" &&
          manifest?.display === "standalone" &&
          Array.isArray(manifest?.icons) &&
          manifest.icons.length >= 3;
        return { ok, detail: ok ? "ok" : "manifest_contract_mismatch" };
      },
      fetchOptions,
      MAX_JSON_BYTES,
    ),
  );

  checks.push(
    await inspectResponse(
      "service_worker",
      `${canonicalOrigin}/sw.js`,
      (response, body) => {
        const cacheControl = response.headers.get("cache-control") ?? "";
        const ok =
          response.status === 200 &&
          body.includes(
            `const CACHE_VERSION = "${expectations.serviceWorkerVersion}";`,
          ) &&
          /no-cache/i.test(cacheControl) &&
          /no-store/i.test(cacheControl);
        return { ok, detail: ok ? "ok" : "service_worker_contract_mismatch" };
      },
      fetchOptions,
    ),
  );

  const assets = staticAssetPaths(appBody || homeBody, canonicalOrigin);
  if (assets.length === 0) {
    checks.push(
      check("static_assets", false, { detail: "static_assets_missing" }),
    );
  } else {
    const assetResults = await Promise.all(
      assets.map((path) =>
        inspectResponse(
          "static_asset",
          `${canonicalOrigin}${path}`,
          (response) => ({
            ok: response.status === 200,
            detail: response.status === 200 ? "ok" : "unexpected_status",
          }),
          fetchOptions,
          1024,
          { method: "HEAD" },
        ),
      ),
    );
    checks.push(
      check("static_assets", assetResults.every((item) => item.ok), {
        status: assetResults.find((item) => !item.ok)?.status ?? 200,
        latencyMs: Math.max(...assetResults.map((item) => item.latency_ms ?? 0)),
        attempts: assetResults.reduce(
          (sum, item) => sum + (item.attempts ?? 0),
          0,
        ),
        detail: assetResults.every((item) => item.ok)
          ? "ok"
          : "static_asset_failed",
      }),
    );
  }

  checks.push(...(await supabaseChecks(env, fetchOptions)));
  checks.push(await vercelRuntimeCheck(env, fetchOptions, now));

  const failed = checks.filter((item) => !item.ok);
  const report = {
    contract: SYNTHETIC_HEALTH_CONTRACT,
    generated_at: now.toISOString(),
    target: "production",
    ok: failed.length === 0,
    release_sha: releaseSha,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    checks,
  };
  return report;
}

/** Renders a short report containing only bounded check metadata. */
export function syntheticHealthMarkdown(report) {
  const lines = [
    "# BibleQuest daily synthetic health",
    "",
    `- Result: **${report.ok ? "PASS" : "FAIL"}**`,
    `- Generated: \`${report.generated_at}\``,
    `- Release: \`${report.release_sha ?? "unavailable"}\``,
    `- Checks: ${report.summary.passed}/${report.summary.total} passed`,
    "",
    "| Check | Result | HTTP | Latency | Detail |",
    "| --- | --- | ---: | ---: | --- |",
  ];
  for (const item of report.checks) {
    lines.push(
      `| \`${item.id}\` | ${item.ok ? "PASS" : "FAIL"} | ${
        item.status ?? "—"
      } | ${item.latency_ms === null ? "—" : `${item.latency_ms} ms`} | \`${
        item.detail
      }\` |`,
    );
  }
  lines.push(
    "",
    "Reports contain no response bodies, credentials, user records, or provider URLs.",
    "",
  );
  return lines.join("\n");
}

/** Chooses one deduplicated issue action from the sanitized report. */
export function syntheticIncidentAction(report, openIssues) {
  const current = openIssues.find(
    (issue) =>
      typeof issue?.number === "number" &&
      typeof issue?.body === "string" &&
      issue.body.includes(SYNTHETIC_ISSUE_MARKER),
  );
  if (!report.ok && !current) return { action: "create", issue: null };
  if (!report.ok && current) return { action: "update", issue: current };
  if (report.ok && current) return { action: "recover", issue: current };
  return { action: "none", issue: null };
}

/** Builds an issue body from fixed labels and sanitized failure metadata only. */
export function syntheticIncidentBody(report) {
  const failures = report.checks.filter((item) => !item.ok);
  return [
    SYNTHETIC_ISSUE_MARKER,
    "Daily production synthetic monitoring detected a failure.",
    "",
    `Last run: \`${report.generated_at}\``,
    `Release: \`${report.release_sha ?? "unavailable"}\``,
    "",
    ...failures.map(
      (item) =>
        `- \`${item.id}\`: \`${item.detail}\` (HTTP ${
          item.status ?? "n/a"
        }, ${item.latency_ms ?? "n/a"} ms)`,
    ),
    "",
    "Run `pnpm synthetic:health` locally with approved monitor credentials, then inspect the archived workflow report.",
    "",
  ].join("\n");
}
