/**
 * Read-only production compatibility probe.
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
  console.log(line);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ""}`);
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
    result(
      response.ok &&
        finalUrl.origin === appUrl.origin &&
        body?.status === "ok" &&
        body?.app === "biblequest",
      "deployed health endpoint",
      response.ok ? `${response.status} ${body?.status ?? "invalid body"}` : `HTTP ${response.status}`,
    );
  } catch (error) {
    result(false, "deployed health endpoint", error instanceof Error ? error.message : "request failed");
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
      normalizedOgUrl === appUrl.origin &&
      normalizedCanonicalUrl === appUrl.origin;
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
      error instanceof Error ? error.message : "request failed",
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
      const detail = present
        ? `selected ${check.migration} schema contract resolves`
        : `${code ?? `HTTP ${response.status}`} (requires migration ${check.migration})`;
      result(present, `${check.table}.${check.select}`, detail);
    } catch (error) {
      result(
        false,
        `${check.table}.${check.select}`,
        error instanceof Error ? error.message : "request failed",
      );
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
        : `${body?.code ?? `HTTP ${response.status}`}`;
      result(ok, check.label, detail);
    } catch (error) {
      result(
        false,
        check.label,
        error instanceof Error ? error.message : "request failed",
      );
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
      response.ok ? `${count ?? "unknown"}/0` : `${body?.code ?? `HTTP ${response.status}`}`,
    );
  } catch (error) {
    result(
      false,
      "active approved premium quests",
      error instanceof Error ? error.message : "request failed",
    );
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
      error instanceof Error ? error.message : "request failed",
    );
  }
}

console.log("BibleQuest production readiness (read-only)\n");

if (failures.length === 0) {
  await checkHealth();
  await checkCanonicalMetadata();
  await checkSchema();
  await checkContent();
  await checkAuthMethods();
} else {
  for (const failure of failures) console.log(`FAIL  configuration — ${failure}`);
}

console.log(
  "\nManual gates not covered: migration history, backup/restore, SMTP delivery, signed two-user RLS isolation, account purge, offline reconnect, and device QA.",
);

if (failures.length > 0) {
  console.log(`\nProduction readiness failed (${failures.length} check${failures.length === 1 ? "" : "s"}).`);
  process.exitCode = 1;
} else {
  console.log("\nProduction compatibility checks passed.");
}
