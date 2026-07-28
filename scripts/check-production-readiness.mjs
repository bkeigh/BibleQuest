/**
 * Non-mutating production compatibility probe.
 *
 * Uses the same publishable Supabase configuration as the browser. It never
 * needs a database password, service-role key, or Supabase access token, and it
 * never writes application data. The checks deliberately stop at public
 * schema visibility, public launch-content counts and exact manifest hashes,
 * auth-provider settings,
 * and deployed health/canonical metadata; RLS isolation and SMTP delivery
 * still require the manual staging/production runbooks.
 *
 * Run: pnpm check:production-readiness
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  DAILY_QUEST_SYNC_CONTRACT,
  ACCOUNT_SYNC_CONTRACT,
  isDailyQuestSyncContract,
  isAccountSyncContract,
} from "./lib/observability-evidence.mjs";

const JSON_OUTPUT = process.argv.includes("--json");
const CANONICAL_ORIGIN = "https://www.biblequest.co";
const observations = [];
let healthEvidence = null;
let canonicalEvidence = false;
const schemaEvidence = [];
const contentEvidence = [];
const authEvidence = {
  settings_reachable: false,
  email_enabled: false,
  google_enabled: false,
  phone_disabled: false,
};

const seedManifest = JSON.parse(
  readFileSync(
    new URL("../supabase/seed-manifest.json", import.meta.url),
    "utf8",
  ),
);
if (seedManifest.version !== 1 || seedManifest.algorithm !== "sha256-json-v1") {
  throw new Error("Unsupported or missing Supabase seed manifest");
}

const EXPECTED_CONTENT = [
  {
    table: "quest_templates",
    filters: {
      is_active: "eq.true",
      review_status: "eq.approved",
      is_premium: "eq.false",
    },
    label: "canonical approved free quests",
  },
  {
    table: "daily_verses",
    filters: { is_active: "eq.true" },
    label: "canonical active daily passages",
  },
  {
    table: "milestones",
    filters: { is_active: "eq.true" },
    label: "canonical active milestones",
  },
  {
    table: "prayer_prompts",
    filters: { is_active: "eq.true" },
    label: "canonical active prayer prompts",
  },
  {
    table: "reflection_prompts",
    filters: { is_active: "eq.true" },
    label: "canonical active reflection prompts",
  },
];

const REQUIRED_SCHEMA = [
  {
    table: "user_daily_quests",
    select: "picked_at,expires_at",
    migration: "0010",
  },
  {
    table: "user_recent_verses",
    select: "book_slug",
    migration: "0010",
  },
  {
    table: "user_settings",
    select: "preferred_bible_translation",
    migration: "0011",
  },
  {
    table: "verse_bookmarks",
    select: "translation_key",
    migration: "0011",
  },
  {
    table: "journey_events",
    select: "date_key,source_id",
    migration: "0014",
  },
  {
    table: "user_daily_quest_days",
    select: "assigned_date,revision",
    migration: "0015",
  },
];

// Each public RPC returns exactly one fixed identity plus an authorization
// posture boolean; no user or financial row is read into this process.
const POSTURE_CONTRACTS = [
  {
    rpc: "profile_avatar_contract",
    contract: "biblequest_profile_avatar_v1",
    migration: "0023",
    label: "private profile avatar posture",
  },
  {
    rpc: "push_reminder_contract",
    contract: "biblequest_private_push_v1",
    migration: "0024",
    label: "private push reminder posture",
  },
  {
    rpc: "stripe_billing_contract",
    contract: "biblequest_stripe_test_billing_v2",
    migration: "0028",
    label: "direct Stripe billing posture",
  },
  {
    rpc: "stripe_support_contract",
    contract: "biblequest_stripe_one_time_support_v1",
    migration: "0026",
    label: "one-time Stripe support posture",
  },
  {
    rpc: "operator_plus_grant_contract",
    contract: "biblequest_operator_plus_grant_v1",
    migration: "0030",
    label: "operator Plus grant posture",
  },
];

const supabaseUrlValue = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const appUrlValue =
  process.env.BIBLEQUEST_READINESS_APP_URL?.trim() || "https://www.biblequest.co";

const failures = [];

function configuredUrl(value, label) {
  if (!value) {
    failures.push(`${label} is not configured`);
    return null;
  }

  try {
    const parsed = new URL(value);
    const isLocal =
      parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
      failures.push(`${label} must use HTTPS outside local development`);
      return null;
    }
    return parsed;
  } catch {
    failures.push(`${label} is not a valid URL`);
    return null;
  }
}

const supabaseUrl = configuredUrl(
  supabaseUrlValue,
  "NEXT_PUBLIC_SUPABASE_URL",
);
const appUrl = configuredUrl(appUrlValue, "BIBLEQUEST_READINESS_APP_URL");

if (!publishableKey) {
  failures.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
}

function result(ok, label, detail) {
  const line = `${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`;
  observations.push({ ok, label });
  if (!JSON_OUTPUT) console.log(line);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ""}`);
}

/** Maps request failures to fixed evidence categories without echoing URLs. */
function safeRequestFailure(error) {
  if (error && typeof error === "object") {
    const name = typeof error.name === "string" ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") return "timeout";
  }
  return "request failed";
}

/** Accepts only short provider codes that cannot carry free-form content. */
function safeProviderCode(value, status) {
  return typeof value === "string" && /^[A-Z0-9_]{1,16}$/i.test(value)
    ? value
    : `HTTP ${status}`;
}

/** Reconstructs the bounded public health contract for evidence output. */
function safeHealthBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value;
  const sha = (item) =>
    item === null ||
    (typeof item === "string" && /^[a-f0-9]{40}$/i.test(item));
  if (
    candidate.status !== "ok" ||
    candidate.app !== "biblequest" ||
    candidate.contract !== "biblequest_observability_v1" ||
    !sha(candidate.release_sha) ||
    !sha(candidate.rollback_sha) ||
    candidate.canonical_origin !== CANONICAL_ORIGIN ||
    typeof candidate.canonical_origin_matches !== "boolean" ||
    !["configured", "guest-only", "invalid"].includes(candidate.auth_posture) ||
    !["configured", "disabled", "invalid"].includes(candidate.analytics_posture) ||
    candidate.schema_contract !== "0030" ||
    candidate.content_contract !== "seed-manifest-v1" ||
    !/^biblequest-v\d{1,4}$/.test(candidate.service_worker_version) ||
    !["coming-soon", "test", "live", "invalid"].includes(
      candidate.billing_mode,
    ) ||
    typeof candidate.billing_purchases_enabled !== "boolean" ||
    typeof candidate.billing_support_enabled !== "boolean"
  ) {
    return null;
  }
  return {
    release_sha: candidate.release_sha,
    rollback_sha: candidate.rollback_sha,
    canonical_origin: candidate.canonical_origin,
    canonical_origin_matches: candidate.canonical_origin_matches,
    auth_posture: candidate.auth_posture,
    analytics_posture: candidate.analytics_posture,
    schema_contract: candidate.schema_contract,
    content_contract: candidate.content_contract,
    service_worker_version: candidate.service_worker_version,
    billing_mode: candidate.billing_mode,
    billing_purchases_enabled: candidate.billing_purchases_enabled,
    billing_support_enabled: candidate.billing_support_enabled,
  };
}

async function jsonBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function supabaseFetch(path, init = {}) {
  return fetch(new URL(path, supabaseUrl), {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

function postgrestPath(table, select, filters = {}, limit = "1") {
  const params = new URLSearchParams({ select, limit, ...filters });
  return `/rest/v1/${encodeURIComponent(table)}?${params.toString()}`;
}

function contentNaturalKey(table, row) {
  if (table === "quest_templates") return row.slug;
  if (table === "daily_verses") {
    return [row.book_slug, row.chapter, row.verse_start, row.verse_end].join(":");
  }
  return row.key;
}

function contentHash(record) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

async function checkHealth() {
  try {
    const response = await fetch(new URL("/api/health", appUrl), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await jsonBody(response);
    const finalUrl = new URL(response.url);
    const safeBody = safeHealthBody(body);
    const ok =
      response.ok && finalUrl.origin === appUrl.origin && safeBody !== null;
    healthEvidence = ok ? safeBody : null;
    result(
      ok,
      "deployed health endpoint",
      response.ok ? `${response.status} ${safeBody ? "valid contract" : "invalid body"}` : `HTTP ${response.status}`,
    );
  } catch (error) {
    result(false, "deployed health endpoint", safeRequestFailure(error));
  }
}

async function checkCanonicalMetadata() {
  try {
    const response = await fetch(appUrl, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    const finalUrl = new URL(response.url);
    const ogUrl = html.match(
      /<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i,
    )?.[1];
    const canonicalTag = html.match(
      /<link\b[^>]*\brel=["']canonical["'][^>]*>/i,
    )?.[0];
    const canonicalUrl = canonicalTag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const normalizedOgUrl = ogUrl ? new URL(ogUrl).origin : null;
    const normalizedCanonicalUrl = canonicalUrl
      ? new URL(canonicalUrl, appUrl).origin
      : null;
    const ok =
      response.ok &&
      finalUrl.origin === appUrl.origin &&
      normalizedOgUrl === CANONICAL_ORIGIN &&
      normalizedCanonicalUrl === CANONICAL_ORIGIN;
    canonicalEvidence = ok;
    result(
      ok,
      "canonical production metadata",
      ok
        ? "redirect, canonical, and og:url use www"
        : "expected the www origin in redirect, canonical, and og:url",
    );
  } catch (error) {
    result(
      false,
      "canonical production metadata",
      safeRequestFailure(error),
    );
  }
}

async function checkSchema() {
  for (const check of REQUIRED_SCHEMA) {
    try {
      const response = await supabaseFetch(
        postgrestPath(check.table, check.select),
      );
      const body = await jsonBody(response);
      const code = typeof body?.code === "string" ? body.code : null;
      // Private tables intentionally deny the anonymous role after the schema
      // is resolved. PostgreSQL 42501 therefore proves the named relation and
      // selected columns exist without weakening RLS or reading a user row.
      const present = response.ok || code === "42501";
      schemaEvidence.push({
        contract: `${check.table}.${check.select}`,
        migration: check.migration,
        ok: present,
      });
      const detail = present
        ? `selected ${check.migration} schema contract resolves`
        : `${safeProviderCode(code, response.status)} (requires migration ${check.migration})`;
      result(present, `${check.table}.${check.select}`, detail);
    } catch (error) {
      result(
        false,
        `${check.table}.${check.select}`,
        safeRequestFailure(error),
      );
      schemaEvidence.push({
        contract: `${check.table}.${check.select}`,
        migration: check.migration,
        ok: false,
      });
    }
  }

  // The bounded contract checks the CAS RPC, trigger bindings, RLS, and exact
  // grants server-side without returning catalog diagnostics or user rows.
  try {
    const response = await supabaseFetch(
      "/rest/v1/rpc/daily_quest_sync_contract",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const body = await jsonBody(response);
    const ok = response.ok && isDailyQuestSyncContract(body);
    schemaEvidence.push({
      contract: DAILY_QUEST_SYNC_CONTRACT,
      migration: "0015",
      ok,
    });
    result(
      ok,
      "daily quest transactional sync posture",
      response.ok
        ? ok
          ? "CAS RPC, triggers, RLS, and grants match 0015"
          : "invalid bounded contract"
        : safeProviderCode(body?.code, response.status),
    );
  } catch (error) {
    schemaEvidence.push({
      contract: DAILY_QUEST_SYNC_CONTRACT,
      migration: "0015",
      ok: false,
    });
    result(
      false,
      "daily quest transactional sync posture",
      safeRequestFailure(error),
    );
  }

  // The bounded 0019 contract proves the complete identity, generation,
  // per-row revision/CAS, RPC, trigger, and direct-mutation boundary without
  // attempting a user-data write.
  try {
    const response = await supabaseFetch(
      "/rest/v1/rpc/account_sync_contract",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const body = await jsonBody(response);
    const ok = response.ok && isAccountSyncContract(body);
    schemaEvidence.push({
      contract: ACCOUNT_SYNC_CONTRACT,
      migration: "0019",
      ok,
    });
    result(
      ok,
      "account identity and generation boundary",
      response.ok
        ? ok
          ? "identity, generation, revision/CAS, RPC, trigger, and grant boundary match 0019"
          : "invalid bounded contract"
        : safeProviderCode(body?.code, response.status),
    );
  } catch (error) {
    schemaEvidence.push({
      contract: ACCOUNT_SYNC_CONTRACT,
      migration: "0019",
      ok: false,
    });
    result(
      false,
      "account identity and generation boundary",
      safeRequestFailure(error),
    );
  }

  // The 0022 contract must prove deletion is generation-bound and resilient.
  try {
    const response = await supabaseFetch(
      "/rest/v1/rpc/account_deletion_contract",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const body = await jsonBody(response);
    const ok =
      response.ok &&
      body?.contract === "generation_bound_account_deletion_v2" &&
      body?.ready === true &&
      Object.keys(body).length === 2;
    schemaEvidence.push({
      contract: "generation_bound_account_deletion_v2",
      migration: "0022",
      ok,
    });
    result(
      ok,
      "generation-bound account deletion",
      response.ok
        ? ok
          ? "real-user deletion path matches 0022"
          : "invalid bounded contract"
        : safeProviderCode(body?.code, response.status),
    );
  } catch (error) {
    schemaEvidence.push({
      contract: "generation_bound_account_deletion_v2",
      migration: "0022",
      ok: false,
    });
    result(
      false,
      "generation-bound account deletion",
      safeRequestFailure(error),
    );
  }

  // An anonymous invocation must still reach the sealed RPC and be rejected.
  // A missing function returns 404, so this prevents health metadata from
  // claiming account deletion is ready when the migration is absent.
  try {
    const response = await supabaseFetch(
      "/rest/v1/rpc/delete_own_account",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const ok = response.status === 401;
    schemaEvidence.push({
      contract: "delete_own_account_authenticated_only",
      migration: "0022",
      ok,
    });
    result(
      ok,
      "self-service account deletion boundary",
      ok ? "authenticated-only deletion RPC is present and sealed" : `HTTP ${response.status}`,
    );
  } catch (error) {
    schemaEvidence.push({
      contract: "delete_own_account_authenticated_only",
      migration: "0022",
      ok: false,
    });
    result(
      false,
      "self-service account deletion boundary",
      safeRequestFailure(error),
    );
  }

  // New launch capabilities expose only fixed two-field readiness contracts.
  for (const check of POSTURE_CONTRACTS) {
    try {
      const response = await supabaseFetch(`/rest/v1/rpc/${check.rpc}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await jsonBody(response);
      const ok =
        response.ok &&
        body?.contract === check.contract &&
        body?.ok === true &&
        Object.keys(body).sort().join(",") === "contract,ok";
      schemaEvidence.push({
        contract: check.contract,
        migration: check.migration,
        ok,
      });
      result(
        ok,
        check.label,
        response.ok
          ? ok
            ? `bounded contract matches ${check.migration}`
            : "invalid bounded contract"
          : safeProviderCode(body?.code, response.status),
      );
    } catch (error) {
      schemaEvidence.push({
        contract: check.contract,
        migration: check.migration,
        ok: false,
      });
      result(false, check.label, safeRequestFailure(error));
    }
  }
}

async function checkContent() {
  for (const check of EXPECTED_CONTENT) {
    try {
      const expected = seedManifest.tables[check.table];
      const expectedHashes = expected.hashes;
      const expectedCount = Object.keys(expectedHashes).length;
      const response = await supabaseFetch(
        postgrestPath(
          check.table,
          expected.fields.join(","),
          check.filters,
          "1000",
        ),
        { headers: { Prefer: "count=exact", Range: "0-999" } },
      );
      const body = await jsonBody(response);
      const contentRange = response.headers.get("content-range") ?? "";
      const countText = contentRange.split("/").at(-1);
      const count = countText && /^\d+$/.test(countText) ? Number(countText) : null;
      const rows = response.ok && Array.isArray(body) ? body : [];
      const seen = new Set();
      let duplicates = 0;
      let unexpected = 0;
      let mismatched = 0;
      let blankScripture = 0;
      for (const row of rows) {
        const key = contentNaturalKey(check.table, row);
        if (seen.has(key)) duplicates += 1;
        seen.add(key);
        const expectedHash = expectedHashes[key];
        if (!expectedHash) {
          unexpected += 1;
          continue;
        }
        const normalized = Object.fromEntries(
          expected.fields.map((field) => [field, row[field]]),
        );
        if (contentHash(normalized) !== expectedHash) mismatched += 1;
        if (
          check.table === "quest_templates" &&
          (typeof row.scripture_text_snapshot !== "string" ||
            row.scripture_text_snapshot.trim() === "")
        ) {
          blankScripture += 1;
        }
      }
      const missing = Object.keys(expectedHashes).filter((key) => !seen.has(key)).length;
      const ok =
        response.ok &&
        count === expectedCount &&
        rows.length === expectedCount &&
        duplicates === 0 &&
        unexpected === 0 &&
        missing === 0 &&
        mismatched === 0 &&
        blankScripture === 0;
      const detail = response.ok
        ? [
            `${count ?? "unknown"}/${expectedCount}`,
            missing ? `${missing} missing` : null,
            unexpected ? `${unexpected} unexpected` : null,
            mismatched ? `${mismatched} content mismatches` : null,
            duplicates ? `${duplicates} duplicate keys` : null,
            blankScripture ? `${blankScripture} blank Scripture snapshots` : null,
          ].filter(Boolean).join("; ")
        : safeProviderCode(body?.code, response.status);
      contentEvidence.push({ table: check.table, ok });
      result(ok, check.label, detail);
    } catch (error) {
      result(
        false,
        check.label,
        safeRequestFailure(error),
      );
      contentEvidence.push({ table: check.table, ok: false });
    }
  }

  try {
    const response = await supabaseFetch(
      postgrestPath(
        "quest_templates",
        "slug",
        {
          is_active: "eq.true",
          review_status: "eq.approved",
          is_premium: "eq.true",
        },
      ),
      { headers: { Prefer: "count=exact", Range: "0-0" } },
    );
    const body = response.ok ? null : await jsonBody(response);
    const countText = (response.headers.get("content-range") ?? "")
      .split("/")
      .at(-1);
    const count = countText && /^\d+$/.test(countText) ? Number(countText) : null;
    result(
      response.ok && count === 0,
      "active approved premium quests",
      response.ok
        ? `${count ?? "unknown"}/0`
        : safeProviderCode(body?.code, response.status),
    );
    contentEvidence.push({
      table: "premium_quest_posture",
      ok: response.ok && count === 0,
    });
  } catch (error) {
    result(
      false,
      "active approved premium quests",
      safeRequestFailure(error),
    );
    contentEvidence.push({ table: "premium_quest_posture", ok: false });
  }
}

async function checkAuthMethods() {
  try {
    const response = await supabaseFetch("/auth/v1/settings");
    const body = await jsonBody(response);
    if (!response.ok || !body || typeof body !== "object") {
      result(false, "auth provider configuration", `HTTP ${response.status}`);
      return;
    }

    const providers = body.external ?? {};
    authEvidence.settings_reachable = true;
    authEvidence.email_enabled = providers.email === true;
    authEvidence.google_enabled = providers.google === true;
    authEvidence.phone_disabled = providers.phone !== true;
    result(
      providers.email === true,
      "email provider enabled (delivery manual)",
    );
    result(
      providers.google === true,
      "Google provider enabled (round trip manual)",
    );
    result(
      providers.phone !== true,
      "phone provider disabled (deployed UI manual)",
    );
  } catch (error) {
    result(
      false,
      "auth provider configuration",
      safeRequestFailure(error),
    );
  }
}

if (!JSON_OUTPUT) console.log("BibleQuest production readiness (non-mutating)\n");

if (failures.length === 0) {
  await checkHealth();
  await checkCanonicalMetadata();
  await checkSchema();
  await checkContent();
  await checkAuthMethods();
} else {
  if (!JSON_OUTPUT) {
    for (const failure of failures) console.log(`FAIL  configuration — ${failure}`);
  }
}

if (JSON_OUTPUT) {
  console.log(
    JSON.stringify({
      contract: "biblequest_readiness_v1",
      ok: failures.length === 0,
      external_health: { ok: healthEvidence !== null, release: healthEvidence },
      canonical_metadata: { ok: canonicalEvidence },
      schema_parity: {
        ok:
          schemaEvidence.length ===
            REQUIRED_SCHEMA.length + 4 + POSTURE_CONTRACTS.length &&
          schemaEvidence.every((check) => check.ok),
        checks: schemaEvidence,
      },
      content_parity: {
        ok:
          contentEvidence.length === EXPECTED_CONTENT.length + 1 &&
          contentEvidence.every((check) => check.ok),
        checks: contentEvidence,
      },
      auth_providers: authEvidence,
      check_count: observations.length,
      failed_check_count: observations.filter((item) => !item.ok).length,
    }),
  );
} else {
  console.log(
    "\nManual gates not covered: migration history, backup/restore, SMTP delivery, signed two-user RLS isolation, account purge, offline reconnect, and device QA.",
  );

  if (failures.length > 0) {
    console.log(`\nProduction readiness failed (${failures.length} check${failures.length === 1 ? "" : "s"}).`);
  } else {
    console.log("\nProduction compatibility checks passed.");
  }
}

if (failures.length > 0) process.exitCode = 1;
