import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-production-lifetime-migration.mjs"),
  "utf8",
);
const BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260727193000_reconcile_launch_contracts_and_lifetime_plus.before.sql",
  ),
  "utf8",
);
const AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260727193000_reconcile_launch_contracts_and_lifetime_plus.after.sql",
  ),
  "utf8",
);
const LIFETIME = readFileSync(
  join(ROOT, "supabase", "migrations", "0028_stripe_lifetime_plus.sql"),
  "utf8",
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/** Hashes the only lifetime schema source used to build the production packet. */
function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("production lifetime migration reconciliation", () => {
  it("pins the exact project, packet, and reviewed 0028 source", () => {
    expect(SCRIPT).toContain('const PROJECT_REF = "iacnjqnssovaaojswjoh";');
    expect(SCRIPT).toContain('const PACKET_VERSION = "20260727193000";');
    expect(SCRIPT).toContain(sha256(LIFETIME));
    expect(SCRIPT).toContain(
      "BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM",
    );
  });

  it("fails closed on unexpected history, backup, SQL, or apply posture", () => {
    expect(SCRIPT).toContain("assertHistory(remoteHistory(prepared.workdir)");
    expect(SCRIPT).toContain("Latest physical production backup is stale");
    expect(SCRIPT).toContain("Reviewed 0028 source checksum changed");
    expect(SCRIPT).toContain(
      "Dry run proposed ${unique.length === 0 ? \"no packet\"",
    );
    expect(SCRIPT).not.toContain("migration repair");
    expect(SCRIPT).not.toContain("--include-all");
  });

  it("requires the complete pre-0028 production boundary and zero rows", () => {
    expect(BEFORE).toContain(
      "if exists (select 1 from public.subscriptions)",
    );
    expect(BEFORE).toContain("lifetime_column_count <> 0");
    expect(BEFORE).toContain("biblequest_profile_avatar_v1");
    expect(BEFORE).toContain("biblequest_private_push_v1");
    expect(BEFORE).toContain("biblequest_stripe_test_billing_v1");
    expect(BEFORE).toContain("biblequest_stripe_one_time_support_v1");
    expect(BEFORE).toContain("public.console_audit_logs");
    expect(BEFORE).toContain("public.console_insights(integer)");
  });

  it("proves the v2 contract after the transactional packet", () => {
    expect(AFTER).toContain("biblequest_stripe_test_billing_v2");
    expect(AFTER).toContain("production Stripe v2 contract verification failed");
    expect(PACKAGE.scripts["check:production-lifetime-migration"]).toBe(
      "node scripts/reconcile-production-lifetime-migration.mjs --dry-run",
    );
  });
});
