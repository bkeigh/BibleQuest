import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-production-web-account-deletion.mjs"),
  "utf8",
);
const NATIVE_SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-production-native-availability.mjs"),
  "utf8",
);
const BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260812005000_web_account_deletion_hardening.before.sql",
  ),
  "utf8",
);
const AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260812005000_web_account_deletion_hardening.after.sql",
  ),
  "utf8",
);
const NATIVE_BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260812010000_native_account_availability.before.sql",
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
    "0038_web_account_deletion_hardening.sql",
  ),
);
const NATIVE_MIGRATION = readFileSync(
  join(
    ROOT,
    "supabase",
    "migrations",
    "0037_native_account_beta_availability.sql",
  ),
);
const READINESS = readFileSync(
  join(ROOT, "scripts", "check-production-readiness.mjs"),
  "utf8",
);
const CONCURRENCY = readFileSync(
  join(ROOT, "scripts", "test-web-account-deletion-concurrency.mjs"),
  "utf8",
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/** Hashes one reviewed public release input. */
function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

/** Keeps the legacy Production prefix fixed while later lanes append. */
function frozenPrefix() {
  return `${MANIFEST.toString("utf8").trim().split("\n").slice(0, 35).join("\n")}\n`;
}

describe("production web account deletion hardening", () => {
  it("pins exact Production history and keeps native 0037 separate", () => {
    expect(SCRIPT).toContain('const PROJECT_REF = "iacnjqnssovaaojswjoh";');
    expect(SCRIPT).toContain(sha256(frozenPrefix()));
    expect(SCRIPT).toContain(sha256(MIGRATION));
    expect(SCRIPT).toContain(sha256(NATIVE_MIGRATION));
    expect(SCRIPT).toContain(sha256(BEFORE));
    expect(SCRIPT).toContain(sha256(AFTER));
    expect(SCRIPT).toContain('version: "20260812005000"');
    expect(MANIFEST.toString("utf8").trim().split("\n")).toHaveLength(38);
    expect(Number("20260812005000")).toBeLessThan(Number("20260812010000"));
  });

  it("requires exact history, backup, confirmation, and a one-packet dry run", () => {
    expect(SCRIPT).toContain(
      "Production history differs from the reviewed web deletion lane",
    );
    expect(SCRIPT).toContain(
      "A recent completed physical Production backup is required",
    );
    expect(SCRIPT).toContain(
      "Dry run did not propose exactly the reviewed web deletion packet",
    );
    expect(SCRIPT).toContain("BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM");
    expect(SCRIPT).not.toContain("migration repair");
    expect(SCRIPT).not.toContain("--include-all");
  });

  it("rejects partial state and proves the Storage-safe boundary", () => {
    expect(BEFORE).toContain(
      "web account deletion found a partial hardened schema",
    );
    expect(BEFORE).toContain("native account migration must remain separate");
    expect(AFTER).toContain("biblequest_account_deletion_storage_v1");
    expect(AFTER).toContain(
      "web hardening unexpectedly installed provider adoption",
    );
    expect(AFTER).toContain(
      "web hardening unexpectedly installed native availability",
    );
    expect(MIGRATION.toString("utf8")).toContain(
      "if not public.avatar_upload_allowed() then",
    );
    expect(MIGRATION.toString("utf8")).toContain(
      "'service_role', relation.oid, 'DELETE'",
    );
    expect(MIGRATION.toString("utf8")).toContain(
      "to anon, authenticated;",
    );
    expect(MIGRATION.toString("utf8")).toContain(
      'create policy "profile avatars: account deletion guard"',
    );
    expect(MIGRATION.toString("utf8")).toContain("as restrictive");
    expect(MIGRATION.toString("utf8")).toContain(
      "create or replace function public.own_account_deletion_status()",
    );
    expect(MIGRATION.toString("utf8")).toContain(
      "'biblequest_account_deletion_status_v1'",
    );
    expect(BEFORE).toContain("public.own_account_deletion_status()");
    expect(MIGRATION.toString("utf8")).not.toContain(
      "web_protocol_version",
    );
    expect(MIGRATION.toString("utf8")).not.toContain(
      "adopt_web_account_protocol_v2",
    );
    expect(MIGRATION.toString("utf8")).not.toContain(
      'policy "web account protocol:',
    );
  });

  it("preserves a forward-only native packet after web hardening", () => {
    expect(NATIVE_SCRIPT).toContain(
      '["20260812005000", "web_account_deletion_hardening"]',
    );
    expect(NATIVE_SCRIPT).toContain(
      '["20260826010000", "bound_provider_rate_limit_retention"]',
    );
    expect(NATIVE_BEFORE).toContain(
      "public.account_deletion_storage_contract()",
    );
    expect(NATIVE_BEFORE).not.toContain(
      "'public.account_deletion_latches'\n     ) is not null",
    );
  });

  it("wires readiness and the guarded dry-run command", () => {
    expect(READINESS).toContain(
      'rpc: "account_deletion_storage_contract"',
    );
    expect(READINESS).toContain(
      'contract: "biblequest_account_deletion_storage_v1"',
    );
    expect(READINESS).toContain('migration: "0038"');
    expect(PACKAGE.scripts["check:production-web-account-deletion"]).toBe(
      "node scripts/reconcile-production-web-account-deletion.mjs --dry-run",
    );
    expect(PACKAGE.scripts["test:account-deletion-concurrency"]).toBe(
      "node scripts/test-web-account-deletion-concurrency.mjs",
    );
    expect(CONCURRENCY).toContain("biblequest_begin_waiting");
    expect(CONCURRENCY).toContain("biblequest_upload_waiting");
    expect(CONCURRENCY).toContain("biblequest_private_write_first");
    expect(CONCURRENCY).toContain("biblequest_final_deletion_waiting");
    expect(CONCURRENCY).not.toContain("adopt_web_account_protocol_v2");
    expect(CONCURRENCY).toContain("wait_event_type = 'Lock'");
  });
});
