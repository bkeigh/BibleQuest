#!/usr/bin/env node
/**
 * Asks production whether anyone is newly stuck at sign-in.
 *
 * The decision lives in the app (src/lib/observability/signin-health.ts) and is
 * served by /api/health/signin, so this script and the scheduled workflow ask
 * the same question of the same code. Neither needs a database credential —
 * the server already holds one, and this repository is public.
 *
 * Usage:
 *   SIGNIN_HEALTH_SECRET=… pnpm check:signin
 *   SIGNIN_HEALTH_SECRET=… pnpm check:signin --json --fresh-hours 48
 *
 * Exits 1 when someone is newly stuck, so cron or CI can page.
 */

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const asJson = process.argv.includes("--json");
const origin = (
  arg("origin", process.env.BIBLEQUEST_ORIGIN ?? "https://www.biblequest.co")
).replace(/\/$/, "");
const freshHours = arg("fresh-hours", "");
const secret = process.env.SIGNIN_HEALTH_SECRET;

if (!secret) {
  console.error(
    "Set SIGNIN_HEALTH_SECRET (the same value configured on the deployment).",
  );
  process.exit(2);
}

const url = new URL("/api/health/signin", origin);
if (freshHours) url.searchParams.set("freshHours", freshHours);

let report;
try {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  if (response.status === 401) {
    console.error("Rejected: SIGNIN_HEALTH_SECRET does not match the deployment.");
    process.exit(2);
  }
  if (!response.ok) {
    console.error(`Sign-in health endpoint returned ${response.status}.`);
    process.exit(2);
  }
  report = await response.json();
} catch (error) {
  console.error(`Could not reach ${url.origin}: ${error.message}`);
  process.exit(2);
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nSign-in health — ${origin}`);
  console.log(`  users                    ${report.totalUsers}`);
  console.log(`  signed in (24h)          ${report.signedInLastDay}`);
  console.log(`  never signed in          ${report.neverSignedIn}`);
  console.log(`    ↳ new (<${report.freshHours}h)            ${report.newlyStuck}`);
  console.log(`    ↳ backlog                ${report.backlogStuck}`);
  if (report.oldestStuckHours > 0) {
    console.log(
      `  oldest stuck             ${Math.round(report.oldestStuckHours / 24)} days`,
    );
  }
  console.log("");
  if (report.ok) console.log("  OK  nobody newly stuck.\n");
  else for (const problem of report.problems) console.log(`  ATTENTION  ${problem}\n`);
}

process.exit(report.ok ? 0 : 1);
