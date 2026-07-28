import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-production-operator-plus-grants.mjs"),
  "utf8",
);
const BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260728203000_operator_plus_grants.before.sql",
  ),
  "utf8",
);
const AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260728203000_operator_plus_grants.after.sql",
  ),
  "utf8",
);
const MIGRATION = readFileSync(
  join(ROOT, "supabase", "migrations", "0030_operator_plus_grants.sql"),
  "utf8",
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/** Hashes the only 0030 source used to build the production packet. */
function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("production operator Plus reconciliation", () => {
  it("pins the exact project, packet, prior history, and reviewed source", () => {
    expect(SCRIPT).toContain('const PROJECT_REF = "iacnjqnssovaaojswjoh";');
    expect(SCRIPT).toContain('const PACKET_VERSION = "20260728203000";');
    expect(SCRIPT).toContain(
      '["20260728191500", "user_row_size_and_trigger_privileges"]',
    );
    expect(SCRIPT).toContain(sha256(MIGRATION));
    expect(SCRIPT).toContain("BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM");
  });

  it("fails closed on history, backup, checksum, and packet drift", () => {
    expect(SCRIPT).toContain("historyState(remoteHistory(prepared.workdir)");
    expect(SCRIPT).toContain(
      "Production migration history differs from the reviewed history",
    );
    expect(SCRIPT).toContain("Latest physical production backup is stale");
    expect(SCRIPT).toContain("Reviewed 0030 source checksum changed");
    expect(SCRIPT).toContain(
      "Dry run proposed ${unique.length === 0 ? \"no packet\"",
    );
    expect(SCRIPT).not.toContain("migration repair");
    expect(SCRIPT).not.toContain("--include-all");
  });

  it("refuses a weak baseline or any partial 0030 schema", () => {
    expect(BEFORE).toContain("biblequest_stripe_test_billing_v2");
    expect(BEFORE).toContain("secured_trigger_count <> 16");
    expect(BEFORE).toContain("console audit posture is invalid");
    expect(BEFORE).toContain(
      "production operator Plus found a partial 0030 schema",
    );
  });

  it("proves zero invented grants and sealed postflight access", () => {
    expect(AFTER).toContain("biblequest_operator_plus_grant_v1");
    expect(AFTER).toContain(
      "production operator Plus migration created unexpected data",
    );
    expect(AFTER).toContain("operator_plus_grants_open_user_idx");
    expect(AFTER).toContain("mutation_function_count <> 2");
    expect(AFTER).toContain(
      "'authenticated',\n      'public.revoke_operator_plus",
    );
  });

  it("wires the guarded dry run into the package contract", () => {
    expect(PACKAGE.scripts["check:production-operator-plus"]).toBe(
      "node scripts/reconcile-production-operator-plus-grants.mjs --dry-run",
    );
  });
});
