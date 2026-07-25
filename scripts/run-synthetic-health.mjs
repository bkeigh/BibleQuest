#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  runSyntheticHealth,
  syntheticHealthMarkdown,
} from "./lib/synthetic-health.mjs";

function outputDirectory(argv) {
  const index = argv.indexOf("--output-dir");
  const value = index >= 0 ? argv[index + 1] : "artifacts/synthetic-health";
  if (!value || value.startsWith("-")) {
    throw new Error("Synthetic output directory unavailable.");
  }
  return resolve(process.cwd(), value);
}

/** Runs the read-only monitor and writes only its sanitized report formats. */
async function main() {
  const directory = outputDirectory(process.argv.slice(2));
  const report = await runSyntheticHealth();
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(directory, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    ),
    writeFile(
      resolve(directory, "report.md"),
      syntheticHealthMarkdown(report),
      { mode: 0o600 },
    ),
  ]);
  process.stdout.write(
    `Synthetic health ${report.ok ? "PASS" : "FAIL"}: ${
      report.summary.passed
    }/${report.summary.total} checks passed.\n`,
  );
  process.exitCode = report.ok ? 0 : 1;
}

await main();
