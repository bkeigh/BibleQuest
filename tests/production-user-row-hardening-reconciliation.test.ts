import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-production-user-row-hardening.mjs"),
  "utf8",
);
const BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260728191500_user_row_size_and_trigger_privileges.before.sql",
  ),
  "utf8",
);
const AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260728191500_user_row_size_and_trigger_privileges.after.sql",
  ),
  "utf8",
);
const HARDENING = readFileSync(
  join(
    ROOT,
    "supabase",
    "migrations",
    "0029_user_row_size_and_trigger_privileges.sql",
  ),
  "utf8",
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/** Hashes the only 0029 source used to build the production packet. */
function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("production user-row hardening reconciliation", () => {
  it("pins the exact project, packet, prior packet, and reviewed source", () => {
    expect(SCRIPT).toContain('const PROJECT_REF = "iacnjqnssovaaojswjoh";');
    expect(SCRIPT).toContain('const PACKET_VERSION = "20260728191500";');
    expect(SCRIPT).toContain(
      '["20260727193000", "reconcile_launch_contracts_and_lifetime_plus"]',
    );
    expect(SCRIPT).toContain(sha256(HARDENING));
    expect(SCRIPT).toContain("BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM");
  });

  it("fails closed on unexpected history, backup, SQL, or apply posture", () => {
    expect(SCRIPT).toContain("historyState(remoteHistory(prepared.workdir)");
    expect(SCRIPT).toContain(
      "Production migration history differs from the reviewed history",
    );
    expect(SCRIPT).toContain("Latest physical production backup is stale");
    expect(SCRIPT).toContain("Reviewed 0029 source checksum changed");
    expect(SCRIPT).toContain(
      "Dry run proposed ${unique.length === 0 ? \"no packet\"",
    );
    expect(SCRIPT).not.toContain("migration repair");
    expect(SCRIPT).not.toContain("--include-all");
  });

  it("refuses partial schema and existing oversized rows before mutation", () => {
    expect(BEFORE).toContain("biblequest_stripe_test_billing_v2");
    expect(BEFORE).toContain(
      "production user-row hardening found a partial 0029 schema",
    );
    expect(BEFORE).toContain("pg_catalog.pg_column_size(owned_row) > 1048576");
    expect(BEFORE).toContain("production synced table is missing RLS");
  });

  it("proves all sixteen triggers and sealed helper grants afterward", () => {
    expect(AFTER).toContain("secured_trigger_count <> 16");
    expect(AFTER).toContain("array['search_path=\"\"']::text[]");
    expect(AFTER).toContain(
      "'authenticated', 'public.enforce_user_owned_row_size()', 'EXECUTE'",
    );
    expect(AFTER).toContain(
      "'service_role', 'public.ensure_journey_event_date_key()', 'EXECUTE'",
    );
  });

  it("wires the guarded dry run into the package contract", () => {
    expect(
      PACKAGE.scripts["check:production-user-row-hardening"],
    ).toBe(
      "node scripts/reconcile-production-user-row-hardening.mjs --dry-run",
    );
  });
});
