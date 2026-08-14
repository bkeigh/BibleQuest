import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-production-guided-progress.mjs"),
  "utf8",
);
const BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260731011500_guided_pilgrimage_progress.before.sql",
  ),
  "utf8",
);
const AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260731011500_guided_pilgrimage_progress.after.sql",
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
    "0033_guided_pilgrimage_progress.sql",
  ),
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/** Hashes release inputs exactly as the guarded runner does. */
function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

// Keeps the historical 0033 packet pinned while later migrations append safely.
function frozenManifest() {
  return `${MANIFEST.toString("utf8").trim().split("\n").slice(0, 32).join("\n")}\n`;
}

describe("production guided progress migration", () => {
  it("pins the production target, 32-file manifest, source, and packet", () => {
    expect(SCRIPT).toContain('const PROJECT_REF = "iacnjqnssovaaojswjoh";');
    expect(SCRIPT).toContain(sha256(frozenManifest()));
    expect(SCRIPT).toContain(sha256(MIGRATION));
    expect(SCRIPT).toContain('version: "20260731011500"');
    expect(MANIFEST.toString("utf8").trim().split("\n")).toHaveLength(37);
  });

  it("requires exact history, a fresh physical backup, and a narrow dry run", () => {
    expect(SCRIPT).toContain(
      "Production migration history differs from the reviewed history",
    );
    expect(SCRIPT).toContain("No completed physical production backup exists");
    expect(SCRIPT).toContain("Latest physical production backup is stale");
    expect(SCRIPT).toContain(
      "Dry run did not propose exactly the reviewed guided progress packet",
    );
    expect(SCRIPT).toContain(
      "Production public schema differs from the frozen 32-file build",
    );
    expect(SCRIPT).toContain("BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM");
    expect(SCRIPT).not.toContain("migration repair");
    expect(SCRIPT).not.toContain("--include-all");
  });

  it("rejects partial state and proves the complete 0033 boundary", () => {
    expect(BEFORE).toContain(
      "production guided progress found a partial 0033 schema",
    );
    expect(BEFORE).toContain("secured_trigger_count <> 16");
    expect(BEFORE).toContain("^(in|re|du)_[A-Za-z0-9]+$");
    expect(AFTER).toContain(
      '{"contract":"biblequest_guided_progress_sync_v1","ok":true}',
    );
    expect(AFTER).toContain("secured_trigger_count <> 17");
  });

  it("wires the read-only production dry run into the package contract", () => {
    expect(PACKAGE.scripts["check:production-guided-progress"]).toBe(
      "node scripts/reconcile-production-guided-progress.mjs --dry-run",
    );
  });
});
