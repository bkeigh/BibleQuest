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
  const RELEASE_GATED_MIGRATIONS = new Set([
    "0037_native_account_beta_availability.sql",
  ]);
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

  it("binds the page-side challenge version to the worker's own", () => {
    // The page answers the worker's challenge only when the incoming version
    // equals its own constant, and stays SILENT otherwise. Nothing bound the
    // two together: a bump that edited sw.js and observability.json but missed
    // this constant would pass the whole suite, then in production the worker
    // would reject every attest and audit and sign-in would fail for everyone.
    // That is invisible to every other test here, which hardcode the version.
    const worker = readFileSync("public/sw.js", "utf8");
    const helper = readFileSync(
      "src/lib/platform/web-auth-service-worker.ts",
      "utf8",
    );
    const workerVersion = worker.match(/const CACHE_VERSION = "([^"]+)"/)?.[1];
    const pageVersion = helper.match(
      /WEB_AUTH_SERVICE_WORKER_VERSION = "([^"]+)"/,
    )?.[1];

    expect(workerVersion).toBeTruthy();
    expect(pageVersion).toBeTruthy();
    expect(pageVersion).toBe(workerVersion);
  });

  it("advertises production while the exact beta-only migration stays separate", () => {
    // The monitor compares this against production, so a config left behind a
    // production migration reads as drift. The fail-closed native availability
    // switch remains outside that public contract until its separate release.
    const migrations = readdirSync("supabase/migrations");
    // Keep the exception reviewable: a rename or removal must update this
    // release boundary instead of silently changing the production contract.
    for (const migration of RELEASE_GATED_MIGRATIONS) {
      expect(migrations).toContain(migration);
    }
    const latest = migrations
      .filter((name) => !RELEASE_GATED_MIGRATIONS.has(name))
      .map((name) => name.match(/^(\d{4})_/)?.[1])
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    expect(latest).toBeTruthy();
    expect(config.schemaContract).toBe(latest);
  });
});
