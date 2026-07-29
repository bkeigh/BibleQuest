import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = readFileSync(
  join(ROOT, "scripts", "reconcile-production-stripe-corrections.mjs"),
  "utf8",
);
const CONFLICT_BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260729123000_stripe_subscription_conflict_key.before.sql",
  ),
  "utf8",
);
const CONFLICT_AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260729123000_stripe_subscription_conflict_key.after.sql",
  ),
  "utf8",
);
const DISPUTE_BEFORE = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260729123100_stripe_dispute_signal_prefix.before.sql",
  ),
  "utf8",
);
const DISPUTE_AFTER = readFileSync(
  join(
    ROOT,
    "supabase",
    "production-migrations",
    "20260729123100_stripe_dispute_signal_prefix.after.sql",
  ),
  "utf8",
);
const CONFLICT_SOURCE = readFileSync(
  join(
    ROOT,
    "supabase",
    "migrations",
    "0031_stripe_subscription_conflict_key.sql",
  ),
  "utf8",
);
const DISPUTE_SOURCE = readFileSync(
  join(
    ROOT,
    "supabase",
    "migrations",
    "0032_stripe_dispute_signal_prefix.sql",
  ),
  "utf8",
);
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/** Hashes each reviewed source exactly as the production runner does. */
function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("production Stripe corrections reconciliation", () => {
  it("pins the exact production history, packets, sources, and backup gate", () => {
    expect(SCRIPT).toContain('const PROJECT_REF = "iacnjqnssovaaojswjoh";');
    expect(SCRIPT).toContain('version: "20260729123000"');
    expect(SCRIPT).toContain('version: "20260729123100"');
    expect(SCRIPT).toContain(
      '["20260728203000", "operator_plus_grants"]',
    );
    expect(SCRIPT).toContain(sha256(CONFLICT_SOURCE));
    expect(SCRIPT).toContain(sha256(DISPUTE_SOURCE));
    expect(SCRIPT).toContain("Latest physical production backup is stale");
  });

  it("fails closed on manifest, history, proposal, and final schema drift", () => {
    expect(SCRIPT).toContain("Frozen 31-file manifest checksum changed");
    expect(SCRIPT).toContain(
      "Production migration history differs from the reviewed history",
    );
    expect(SCRIPT).toContain(
      "Dry run did not propose exactly the reviewed Stripe corrections",
    );
    expect(SCRIPT).toContain(
      "Production public schema differs from the frozen 31-file build",
    );
    expect(SCRIPT).not.toContain("migration repair");
    expect(SCRIPT).not.toContain("--include-all");
  });

  it("supports only exact forward recovery after the first packet", () => {
    expect(SCRIPT).toContain('return "conflict-applied"');
    expect(SCRIPT).toContain(
      'if (state === "conflict-applied") return [PACKETS[1].filename];',
    );
    expect(SCRIPT).toContain("proposed = dryRun(historyWorkdir");
    expect(SCRIPT).toContain("applyPackets(historyWorkdir)");
    expect(SCRIPT).toContain("BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM");
  });

  it("rejects duplicates and proves the full subscription constraint", () => {
    expect(CONFLICT_BEFORE).toContain(
      "production Stripe subscription identifiers are duplicated",
    );
    expect(CONFLICT_BEFORE).toContain(
      "production Stripe correction found a partial 0031 schema",
    );
    expect(CONFLICT_AFTER).toContain(
      "subscriptions_external_subscription_key",
    );
    expect(CONFLICT_AFTER).toContain(
      "array['external_subscription_id']::name[]",
    );
  });

  it("requires the exact old prefix and proves the exact current prefix", () => {
    expect(DISPUTE_BEFORE).toContain("^(in|re|dp)_[A-Za-z0-9]+$");
    expect(DISPUTE_BEFORE).toContain(
      "production Stripe correction found a partial 0032 schema",
    );
    expect(DISPUTE_AFTER).toContain("^(in|re|du)_[A-Za-z0-9]+$");
    expect(DISPUTE_AFTER).toContain(
      "production 0032 dispute signal posture is invalid",
    );
  });

  it("wires the guarded production dry run into package scripts", () => {
    expect(PACKAGE.scripts["check:production-stripe-corrections"]).toBe(
      "node scripts/reconcile-production-stripe-corrections.mjs --dry-run",
    );
  });
});
