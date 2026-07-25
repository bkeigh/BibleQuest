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
  buildLaunchEvidence,
  fixtureReadiness,
  fixtureSignals,
  signalsFromJsonLines,
} from "./lib/observability-evidence.mjs";

const PHASES = ["preflight", "t+0", "t+5", "t+15"];
const MAX_LOG_BYTES = 10 * 1024 * 1024;

/** Reads one exact enum flag and rejects ambiguous launch evidence labels. */
function phaseFromArguments(argv) {
  const raw = argv.find((value) => value.startsWith("--phase="))?.slice(8);
  if (!raw || !PHASES.includes(raw)) {
    throw new Error("Use --phase=preflight, --phase=t+0, --phase=t+5, or --phase=t+15");
  }
  return raw;
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
    if (statSync(pathname).size > MAX_LOG_BYTES) return null;
    return signalsFromJsonLines(readFileSync(pathname, "utf8"));
  } catch {
    return null;
  }
}

/** Queries recent production runtime logs and suppresses all raw CLI output. */
function signalsFromVercel() {
  const args = [
    "logs",
    "--environment",
    "production",
    "--query",
    "biblequest_client_signal_v1",
    "--since",
    "15m",
    "--limit",
    "1000",
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
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return signalsFromJsonLines(result.stdout);
}

const phase = phaseFromArguments(process.argv.slice(2));
const fixture = process.argv.includes("--fixture");
let readiness;
let signals;
let source;

if (fixture) {
  readiness = fixtureReadiness();
  signals = fixtureSignals();
  source = "fixture";
} else {
  readiness = collectReadiness();
  const exported = process.env.BIBLEQUEST_OBSERVABILITY_LOG_FILE;
  signals = exported ? signalsFromExport(exported) : signalsFromVercel();
  source = exported ? "export_file" : "vercel_cli";
}

const aggregate = aggregateClientSignals(signals ?? [], signals !== null);
const evidence = buildLaunchEvidence(readiness, aggregate, phase, source);
console.log(JSON.stringify(evidence, null, 2));
if (evidence.decision === "HOLD") process.exitCode = 1;
