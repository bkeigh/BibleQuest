import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Release contracts are declared in two places at once: the artefact that
 * implements them and `config/observability.json`, which the health endpoint
 * and the synthetic monitor both read. Nothing used to hold the pair together,
 * so a service-worker bump could ship while the config still advertised the
 * previous version — and the monitor would then report a mismatch against
 * production that looked like deploy drift.
 *
 * These assertions fail at commit time instead, naming the file that lagged.
 */
describe("release contract consistency", () => {
  const config = JSON.parse(
    readFileSync("config/observability.json", "utf8"),
  ) as { serviceWorkerVersion: string; schemaContract: string };

  it("advertises the service worker version the worker actually uses", () => {
    const worker = readFileSync("public/sw.js", "utf8");
    const declared = worker.match(
      /const CACHE_VERSION = "([^"]+)"/,
    )?.[1];

    expect(declared).toBeTruthy();
    expect(config.serviceWorkerVersion).toBe(declared);
  });

  it("advertises the newest applied schema migration", () => {
    // The monitor compares this against production, so a config left behind a
    // migration reads as drift rather than as a stale contract file.
    const latest = readdirSync("supabase/migrations")
      .map((name) => name.match(/^(\d{4})_/)?.[1])
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    expect(latest).toBeTruthy();
    expect(config.schemaContract).toBe(latest);
  });
});
