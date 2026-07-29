import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-staging-migration-history.mjs"),
  "utf8",
);
const PACKET = readFileSync(
  join(
    ROOT,
    "supabase",
    "staging-migrations",
    "20260729110000_reconcile_31_file_manifest.sql",
  ),
  "utf8",
);
const MANIFEST = readFileSync(
  join(ROOT, "supabase", "migrations", "manifest.sha256"),
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/** Hashes the frozen manifest exactly as the reconciliation runner does. */
function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

describe("staging migration reconciliation", () => {
  it("pins the exact staging identity, 31-file manifest, and packet", () => {
    expect(SCRIPT).toContain(
      'const STAGING_PROJECT_NAME = "BibleQuest-Account-Sync-Staging";',
    );
    expect(SCRIPT).toContain('const PRODUCTION_PROJECT_NAME = "BibleQuest";');
    expect(SCRIPT).toContain('const PACKET_VERSION = "20260729110000";');
    expect(SCRIPT).toContain(sha256(MANIFEST));
    expect(MANIFEST.toString("utf8").trim().split("\n")).toHaveLength(31);
  });

  it("fails closed on target, manifest, schema, history, and proposal drift", () => {
    expect(SCRIPT).toContain(
      "Staging target is not distinct from production",
    );
    expect(SCRIPT).toContain(
      "Migration file set differs from the frozen manifest",
    );
    expect(SCRIPT).toContain(
      "Staging public schema differs from the frozen 31-file build",
    );
    expect(SCRIPT).toContain(
      "Staging migration history differs from the reviewed state",
    );
    expect(SCRIPT).toContain(
      "Dry run did not propose exactly the reviewed staging packet",
    );
  });

  it("uses isolated lanes and requires a dry run before the only apply", () => {
    expect(SCRIPT).toContain("mkdtemp");
    expect(SCRIPT).toContain("prepareSchemaWorkdir(entries)");
    expect(SCRIPT).toContain("prepareHistoryWorkdir(entries)");
    expect(SCRIPT).toContain("proposed = dryRun(historyWorkdir)");
    expect(SCRIPT).toContain("applyPacket(historyWorkdir)");
    expect(SCRIPT).toContain("BIBLEQUEST_STAGING_MIGRATION_CONFIRM");
    expect(SCRIPT).not.toContain("migration repair");
    expect(SCRIPT).not.toContain("--include-all");
  });

  it("records no schema or data mutation in the attestation packet", () => {
    const withoutComments = PACKET.replace(/^--.*$/gm, "");
    expect(withoutComments).toContain(
      "staging migration prehistory is not the reviewed 28-row state",
    );
    expect(withoutComments).toContain("public.operator_plus_grant_contract()");
    expect(withoutComments).toContain(
      "subscriptions_external_subscription_key",
    );
    expect(withoutComments).toContain("^(in|re|du)_[A-Za-z0-9]+$");
    expect(withoutComments).not.toMatch(
      /\b(?:alter|create|delete|drop|grant|insert|revoke|truncate|update)\b/i,
    );
  });

  it("wires the guarded dry run into the package contract", () => {
    expect(PACKAGE.scripts["check:staging-migration-history"]).toBe(
      "node scripts/reconcile-staging-migration-history.mjs --dry-run",
    );
  });
});
