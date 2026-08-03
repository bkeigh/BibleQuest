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
    "20260803010000_distributed_provider_rate_limits.before.sql",
  ),
  "utf8",
);
const AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260803010000_distributed_provider_rate_limits.after.sql",
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
    "0034_distributed_provider_rate_limits.sql",
  ),
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

// Hashes the guarded release inputs without interpreting their contents.
function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

describe("production provider rate-limit migration", () => {
  it("pins the target, current manifest, source, and long-version packet", () => {
    expect(SCRIPT).toContain('const PROJECT_REF = "iacnjqnssovaaojswjoh";');
    expect(SCRIPT).toContain(sha256(MANIFEST));
    expect(SCRIPT).toContain(sha256(MIGRATION));
    expect(SCRIPT).toContain('version: "20260803010000"');
    expect(MANIFEST.toString("utf8").trim().split("\n")).toHaveLength(33);
  });

  it("requires exact history, a fresh backup, and a one-packet dry run", () => {
    expect(SCRIPT).toContain(
      "Production migration history differs from the reviewed 0034 history",
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

  it("rejects partial state and proves service-only bucket isolation", () => {
    expect(BEFORE).toContain(
      "production provider rate limit found a partial 0034 schema",
    );
    expect(BEFORE).toContain("biblequest_guided_progress_sync_v1");
    expect(AFTER).toContain("biblequest_provider_rate_limit_v1");
    expect(AFTER).toContain("relforcerowsecurity");
    expect(AFTER).toContain("service_role");
    expect(AFTER).toContain("provider_rate_limit_windows");
  });

  it("wires the guarded read-only production check into package scripts", () => {
    expect(PACKAGE.scripts["check:production-provider-rate-limits"]).toBe(
      "node scripts/reconcile-production-provider-rate-limits.mjs --dry-run",
    );
  });
});
