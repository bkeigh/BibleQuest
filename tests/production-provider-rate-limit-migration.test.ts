import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-production-provider-rate-limits.mjs"),
  "utf8",
);
const BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260826010000_bound_provider_rate_limit_retention.before.sql",
  ),
  "utf8",
);
const AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260826010000_bound_provider_rate_limit_retention.after.sql",
  ),
  "utf8",
);
const MANIFEST = readFileSync(
  join(ROOT, "supabase", "migrations", "manifest.sha256"),
);
const MIGRATION = readFileSync(
  join(
    ROOT,
    "supabase",
    "migrations",
    "0039_bound_provider_rate_limit_retention.sql",
  ),
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const REPLACEMENT_RUNBOOK = readFileSync(
  join(ROOT, "docs", "IOS_ACCOUNT_REPLACEMENT_RELEASE.md"),
  "utf8",
);

// Hashes the guarded release inputs without interpreting their contents.
function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

describe("production provider rate-limit migration", () => {
  it("pins the target, current manifest, source, and long-version packet", () => {
    expect(SCRIPT).toContain('const PROJECT_REF = "iacnjqnssovaaojswjoh";');
    expect(SCRIPT).toContain(sha256(MANIFEST));
    expect(SCRIPT).toContain(sha256(MIGRATION));
    expect(SCRIPT).toContain('version: "20260826010000"');
    expect(MANIFEST.toString("utf8").trim().split("\n")).toHaveLength(38);
  });

  it("requires exact history, a fresh backup, and a one-packet dry run", () => {
    expect(SCRIPT).toContain(
      "Production migration history differs from the reviewed 0039 history",
    );
    expect(SCRIPT).toContain("No completed physical production backup exists");
    expect(SCRIPT).toContain("Latest physical production backup is stale");
    expect(SCRIPT).toContain(
      "Dry run did not propose exactly the reviewed provider-rate packet",
    );
    expect(SCRIPT).toContain("BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM");
    expect(SCRIPT).not.toContain("migration repair");
    expect(SCRIPT).not.toContain("--include-all");
  });

  it("requires v2 and proves service-only claims with bounded retention", () => {
    expect(BEFORE).toContain(
      "production provider rate-limit v2 prerequisite is invalid",
    );
    expect(BEFORE).toContain("biblequest_provider_rate_limit_v2");
    expect(MIGRATION.toString("utf8")).toContain("interval '48 hours'");
    expect(MIGRATION.toString("utf8")).toContain("cron.schedule");
    expect(MIGRATION.toString("utf8")).toContain(
      "biblequest-provider-rate-limit-retention-v1",
    );
    expect(MIGRATION.toString("utf8")).toContain(
      "biblequest_provider_rate_limit_v3",
    );
    expect(AFTER).toContain("biblequest_provider_rate_limit_v3");
    expect(AFTER).toContain("migration-stale-probe");
    expect(AFTER).toContain("production provider retention schedule is invalid");
    expect(AFTER).toContain("claim_provider_rate_limit");
    expect(AFTER).toContain("relforcerowsecurity");
    expect(AFTER).toContain("service_role");
    expect(AFTER).toContain("provider_rate_limit_windows");
  });

  it("wires the guarded read-only production check into package scripts", () => {
    expect(PACKAGE.scripts["check:production-provider-rate-limits"]).toBe(
      "node scripts/reconcile-production-provider-rate-limits.mjs --dry-run",
    );
  });

  it("records the applied packet as history instead of a future write", () => {
    expect(REPLACEMENT_RUNBOOK).toContain("PASS — APPLIED; DO NOT REPLAY");
    expect(REPLACEMENT_RUNBOOK).toContain("`applied=true`, `proposed=[]`");
    expect(REPLACEMENT_RUNBOOK).not.toContain("OPEN — 0039 PENDING");
    expect(REPLACEMENT_RUNBOOK).not.toContain(
      "BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM='apply 20260826010000",
    );
  });
});
