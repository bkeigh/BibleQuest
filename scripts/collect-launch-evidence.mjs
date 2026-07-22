/**
 * Collects one sanitized launch checkpoint without writing provider state.
 *
 * Run the same command with --phase=preflight, t+0, t+5, or t+15. Raw Vercel
 * JSONL is held only in memory; output contains reconstructed aggregates only.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import {
  aggregateClientSignals,
  boundedSignalCollection,
  buildLaunchEvidence,
  fixtureReadiness,
  fixtureSignals,
} from "./lib/observability-evidence.mjs";

const PHASES = ["preflight", "t+0", "t+5", "t+15"];
const ENVIRONMENTS = ["production", "preview"];
const MAX_LOG_BYTES = 10 * 1024 * 1024;
const VERCEL_LOG_LIMIT = 1_000;

/** Reads one exact enum flag and rejects ambiguous launch evidence labels. */
function phaseFromArguments(argv) {
  const raw = argv.find((value) => value.startsWith("--phase="))?.slice(8);
  if (!raw || !PHASES.includes(raw)) {
    throw new Error("Use --phase=preflight, --phase=t+0, --phase=t+5, or --phase=t+15");
  }
  return raw;
}

/** Keeps production as the default and requires an exact preview opt-in. */
function environmentFromArguments(argv) {
  const flags = argv.filter((value) => value.startsWith("--environment="));
  const raw = flags[0]?.slice(14) ?? "production";
  if (flags.length > 1 || !ENVIRONMENTS.includes(raw)) {
    throw new Error("Use --environment=production or --environment=preview");
  }
  return raw;
}

/** Rejects ambiguous preview inputs without reflecting their raw values. */
function assertSafeCollectionTarget(environment) {
  const deployment = process.env.BIBLEQUEST_VERCEL_DEPLOYMENT?.trim();
  if (deployment && !/^[a-z0-9][a-z0-9._-]{0,252}$/i.test(deployment)) {
    throw new Error("The Vercel deployment filter is invalid");
  }
  if (environment !== "preview") return;
  if (!deployment) {
    throw new Error("Preview evidence requires a deployment filter");
  }
  try {
    const target = new URL(process.env.BIBLEQUEST_READINESS_APP_URL ?? "");
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.pathname !== "/" ||
      target.search ||
      target.hash
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("Preview evidence requires a safe HTTPS readiness origin");
  }
}

/** Runs the existing read-only probe and parses only its JSON contract. */
function collectReadiness() {
  try {
    const output = execFileSync(
      process.execPath,
      [new URL("./check-production-readiness.mjs", import.meta.url).pathname, "--json"],
      {
        cwd: new URL("..", import.meta.url).pathname,
        encoding: "utf8",
        env: process.env,
        maxBuffer: 2 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return JSON.parse(output);
  } catch (error) {
    const stdout =
      error && typeof error === "object" && typeof error.stdout === "string"
        ? error.stdout
        : "";
    try {
      return JSON.parse(stdout);
    } catch {
      return null;
    }
  }
}

/** Reads an operator-exported JSONL file without reflecting its path or rows. */
function signalsFromExport(pathname) {
  try {
    if (statSync(pathname).size >= MAX_LOG_BYTES) {
      return { status: "truncated", row_count: 0, signals: [] };
    }
    return boundedSignalCollection(readFileSync(pathname, "utf8"));
  } catch {
    return { status: "unavailable", row_count: 0, signals: [] };
  }
}

/** Queries one explicit runtime environment and suppresses all raw CLI output. */
function signalsFromVercel(environment) {
  const args = [
    "logs",
    "--environment",
    environment,
    "--query",
    "biblequest_client_signal_v1",
    "--since",
    "15m",
    "--limit",
    String(VERCEL_LOG_LIMIT),
    "--json",
    "--no-branch",
    "--no-color",
  ];
  if (process.env.BIBLEQUEST_VERCEL_DEPLOYMENT) {
    args.push("--deployment", process.env.BIBLEQUEST_VERCEL_DEPLOYMENT);
  }
  if (process.env.VERCEL_TOKEN) {
    args.push("--token", process.env.VERCEL_TOKEN);
  }
  const result = spawnSync("vercel", args, {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
    env: { ...process.env, CI: "1", VERCEL_TELEMETRY_DISABLED: "1" },
    maxBuffer: MAX_LOG_BYTES,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 30_000,
  });
  if (result.error?.code === "ENOBUFS") {
    return { status: "truncated", row_count: 0, signals: [] };
  }
  if (result.status !== 0 || typeof result.stdout !== "string") {
    return { status: "unavailable", row_count: 0, signals: [] };
  }
  return boundedSignalCollection(result.stdout, VERCEL_LOG_LIMIT);
}

const phase = phaseFromArguments(process.argv.slice(2));
const environment = environmentFromArguments(process.argv.slice(2));
const fixture = process.argv.includes("--fixture");
const liveBillingVerified = process.argv.includes("--live-billing-verified");
let readiness;
let collection;
let source;

if (fixture) {
  readiness = fixtureReadiness();
  collection = {
    status: "complete",
    row_count: fixtureSignals().length,
    signals: fixtureSignals(),
  };
  source = "fixture";
} else {
  assertSafeCollectionTarget(environment);
  readiness = collectReadiness();
  const exported = process.env.BIBLEQUEST_OBSERVABILITY_LOG_FILE;
  collection = exported
    ? signalsFromExport(exported)
    : signalsFromVercel(environment);
  source = exported
    ? `export_file_${environment}`
    : `vercel_cli_${environment}`;
}

const aggregate = aggregateClientSignals(collection.signals, collection.status);
const evidence = buildLaunchEvidence(readiness, aggregate, phase, source, {
  environment,
  liveBillingVerified,
});
console.log(JSON.stringify(evidence, null, 2));
if (evidence.decision === "HOLD") process.exitCode = 1;
