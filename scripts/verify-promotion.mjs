#!/usr/bin/env node
/**
 * Verifies a promotion against the live site, in one command.
 *
 * This exists because of 2026-08-14. That build passed every bundle, header,
 * CSP and CORS gate, and a browser test already loaded `/app` and asserted
 * Home painted — yet it hung on "Restoring your journey" for every visitor.
 *
 * The reason none of that helped is recorded in
 * docs/INCIDENT_2026-08-14_ACCOUNT_RELEASE_HANG.md: the failure was a race in
 * the auth bootstrap that only fires when a *real* Supabase emits
 * INITIAL_SESSION. CI points at a fixture host that never completes that
 * handshake, so the racing event is never emitted and the bug is invisible
 * there. It is only reachable against production.
 *
 * So this check deliberately does what no test can: it drives the promoted
 * artifact, on the real origin, against the real Supabase, with empty storage
 * — the exact conditions under which the outage reproduced.
 *
 * Usage:
 *   node scripts/verify-promotion.mjs                    # expects HEAD
 *   node scripts/verify-promotion.mjs --sha <sha>
 *   node scripts/verify-promotion.mjs --origin https://…
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DEFAULT_ORIGIN = "https://www.biblequest.co";

/** The veil the 2026-08-14 build never lifted. */
const VEIL = "Restoring your journey";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const origin = (arg("origin", DEFAULT_ORIGIN) ?? DEFAULT_ORIGIN).replace(
  /\/$/,
  "",
);
const expectedSha =
  arg("sha") ?? execFileSync("git", ["rev-parse", "HEAD"]).toString().trim();

let failed = false;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  failed = true;
  console.error(`  FAIL  ${m}`);
};

console.log(`\nVerifying ${origin}`);
console.log(`Expecting release ${expectedSha.slice(0, 7)}\n`);

// 1 — Identity. A stale sha means the promotion silently did not take.
console.log("1. Release identity");
let health;
try {
  const response = await fetch(`${origin}/api/health`, { cache: "no-store" });
  health = await response.json();
} catch (error) {
  fail(`health endpoint unreachable: ${error.message}`);
}

if (health) {
  if (health.release_sha === expectedSha) {
    pass(`release_sha ${expectedSha.slice(0, 7)}`);
  } else {
    fail(
      `release_sha is ${String(health.release_sha).slice(0, 7)}, expected ${expectedSha.slice(0, 7)} — the promotion did not take`,
    );
  }
  if (health.status === "ok") pass("status ok");
  else fail(`status ${health.status}`);
  console.log(
    `        auth_posture=${health.auth_posture} schema=${health.schema_contract} rollback=${String(health.rollback_sha).slice(0, 7)}`,
  );
}

// 2 — The worker actually shipped. Compared against the repository copy rather
// than hardcoded markers, so this check cannot drift as the worker changes.
console.log("\n2. Service worker matches this commit");
try {
  const served = (
    await (await fetch(`${origin}/sw.js`, { cache: "no-store" })).text()
  ).trim();
  const local = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8")
    .trim();
  if (served === local) {
    pass("served sw.js is byte-identical to public/sw.js");
  } else {
    fail(
      `served sw.js differs from public/sw.js (served ${served.length}b, repo ${local.length}b) — visitors keep the old worker until it updates`,
    );
  }
} catch (error) {
  fail(`could not compare sw.js: ${error.message}`);
}

// 3 — The part that matters. Real browser, real Supabase, empty storage.
console.log("\n3. The app paints for a first-time visitor");
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    fail("playwright is not installed — cannot verify rendering");
  }
}

if (chromium) {
  const browser = await chromium.launch();
  // A fresh context is the point: 2026-08-14 reproduced with empty storage.
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  try {
    const response = await page.goto(`${origin}/app`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (response?.status() === 200) pass("/app returned 200");
    else fail(`/app returned ${response?.status()}`);

    // Give the client tree the same grace a person would, then require that
    // the holding state is gone. 30s is well past the 2026-08-14 observation
    // that the page was still hung after 30+ seconds.
    await page
      .locator("main")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => {});

    const veiled = await page.getByText(VEIL, { exact: false }).count();
    if (veiled === 0) pass(`no "${VEIL}" veil`);
    else fail(`still showing "${VEIL}" — this is the 2026-08-14 signature`);

    const skeletons = await page
      .getByRole("status", { name: "Loading" })
      .count();
    if (skeletons === 0) pass("no loading skeleton left on screen");
    else fail(`${skeletons} loading skeleton(s) still rendered`);

    // Something a person can actually use, not just a painted shell.
    const interactive = await page.getByRole("button").count();
    const headings = await page.getByRole("heading").count();
    if (interactive + headings > 0) {
      pass(`app rendered (${headings} heading(s), ${interactive} button(s))`);
    } else {
      fail("app rendered nothing interactive");
    }

    if (errors.length === 0) pass("no uncaught page errors");
    else fail(`uncaught page error: ${errors[0]}`);
  } catch (error) {
    fail(`could not load /app: ${error.message}`);
  } finally {
    await browser.close();
  }
}

console.log(
  failed
    ? `\nFAILED. Roll back to ${health?.rollback_sha?.slice(0, 7) ?? "the recorded rollback_sha"}.\n`
    : "\nAll checks passed.\n",
);
process.exit(failed ? 1 : 0);
