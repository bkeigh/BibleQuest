#!/usr/bin/env node
/**
 * Notices when sign-in is failing, so a person does not have to.
 *
 * Every auth defect found between 2026-08-14 and 2026-08-18 ran in production
 * for days, and none was reported by a system — each surfaced because someone
 * happened to look. This is the smallest check that would have caught them.
 *
 * It reads the user list through the Supabase Admin API, which the existing
 * service-role key already reaches; no migration and no new credential. A
 * person who signed up and never signed in is the whole signal, and Supabase
 * omits `last_sign_in_at` until a first success, so the absence is the fact.
 *
 * Usage:
 *   node scripts/check-signin-health.mjs
 *   node scripts/check-signin-health.mjs --fresh-hours 48 --json
 *
 * Exits 1 when someone is newly stuck, so cron or CI can page.
 */

import { assessSigninHealth, DEFAULT_FRESH_HOURS } from "./lib/signin-health.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const asJson = process.argv.includes("--json");
const freshHours = Number(arg("fresh-hours", String(DEFAULT_FRESH_HOURS)));

const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!origin || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
  );
  process.exit(2);
}

/** Page through every account; the list is small but must not silently clip. */
async function allUsers() {
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetch(
      `${origin}/auth/v1/admin/users?page=${page}&per_page=200`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!response.ok) {
      throw new Error(`Admin API returned ${response.status}`);
    }
    const body = await response.json();
    const batch = Array.isArray(body?.users) ? body.users : [];
    users.push(...batch);
    if (batch.length < 200) return users;
  }
  return users;
}

let report;
try {
  report = assessSigninHealth(await allUsers(), new Date(), { freshHours });
} catch (error) {
  console.error(`Sign-in health check could not run: ${error.message}`);
  process.exit(2);
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nSign-in health — ${new Date().toISOString()}`);
  console.log(`  users                    ${report.totalUsers}`);
  console.log(`  signed in (24h)          ${report.signedInLastDay}`);
  console.log(`  never signed in          ${report.neverSignedIn}`);
  console.log(`    ↳ new (<${freshHours}h)            ${report.newlyStuck}`);
  console.log(`    ↳ backlog                ${report.backlogStuck}`);
  if (report.oldestStuckHours > 0) {
    console.log(
      `  oldest stuck             ${Math.round(report.oldestStuckHours / 24)} days`,
    );
  }
  console.log("");
  if (report.ok) {
    console.log("  OK  nobody newly stuck.\n");
  } else {
    for (const problem of report.problems) console.log(`  ATTENTION  ${problem}\n`);
  }
}

process.exit(report.ok ? 0 : 1);
