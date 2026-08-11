import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-production-arcade-store.mjs"),
  "utf8",
);
const BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260804035000_arcade_store_purchases.before.sql",
  ),
  "utf8",
);
const AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260804035000_arcade_store_purchases.after.sql",
  ),
  "utf8",
);
const MANIFEST = readFileSync(
  join(ROOT, "supabase", "migrations", "manifest.sha256"),
);
const MIGRATION = readFileSync(
  join(ROOT, "supabase", "migrations", "0036_arcade_store_purchases.sql"),
);
const PRODUCTION_READINESS = readFileSync(
  join(ROOT, "scripts", "check-production-readiness.mjs"),
  "utf8",
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/** Hashes the guarded release inputs without interpreting their contents. */
function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

/** Keep the production runner pinned through 0036 as later files append. */
function frozenManifest() {
  return `${MANIFEST.toString("utf8").trim().split("\n").slice(0, 35).join("\n")}\n`;
}

describe("production Arcade store migration", () => {
  it("is required by the production readiness contract", () => {
    expect(PRODUCTION_READINESS).toContain(
      'candidate.schema_contract !== "0038"',
    );
    expect(PRODUCTION_READINESS).toContain('rpc: "arcade_store_contract"');
    expect(PRODUCTION_READINESS).toContain(
      'contract: "biblequest_arcade_store_v1"',
    );
  });

  it("pins the target, manifest, source, and long-version packet", () => {
    expect(SCRIPT).toContain('const PROJECT_REF = "iacnjqnssovaaojswjoh";');
    expect(SCRIPT).toContain(sha256(frozenManifest()));
    expect(SCRIPT).toContain(sha256(MIGRATION));
    expect(SCRIPT).toContain('version: "20260804035000"');
    expect(MANIFEST.toString("utf8").trim().split("\n")).toHaveLength(36);
  });

  it("requires exact history, a fresh backup, and a one-packet dry run", () => {
    expect(SCRIPT).toContain(
      "Production migration history differs from the reviewed 0036 history",
    );
    expect(SCRIPT).toContain("No completed physical production backup exists");
    expect(SCRIPT).toContain("Latest physical production backup is stale");
    expect(SCRIPT).toContain(
      "Dry run did not propose exactly the reviewed Arcade store packet",
    );
    expect(SCRIPT).toContain("BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM");
    expect(SCRIPT).not.toContain("migration repair");
    expect(SCRIPT).not.toContain("--include-all");
  });

  it("rejects partial state and proves the sealed service-only boundary", () => {
    expect(BEFORE).toContain("production Arcade store prerequisite is invalid");
    expect(BEFORE).toContain("production Arcade store found a partial 0036 schema");
    expect(AFTER).toContain("biblequest_arcade_store_v1");
    expect(AFTER).toContain("production Arcade store RLS boundary is invalid");
    expect(AFTER).toContain("production Arcade store grants are invalid");
    expect(AFTER).toContain("service_role");
  });

  it("wires the guarded production dry run into package scripts", () => {
    expect(PACKAGE.scripts["check:production-arcade-store"]).toBe(
      "node scripts/reconcile-production-arcade-store.mjs --dry-run",
    );
  });
});
