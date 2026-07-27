import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const JOURNEY_IDENTITY_SHA256 =
  "9497b745c5efc0c3f6c4c82e43e57c4fd9b34e8cfae12e6193226d564da50789";
const EXPECTED_MIGRATIONS = [
  "0001_init.sql",
  "0002_rls_policies.sql",
  "0003_chapters_read_unique.sql",
  "0004_multi_daily_quests.sql",
  "0005_user_language.sql",
  "0006_purge_user_data.sql",
  "0007_user_quests.sql",
  "0008_reassert_rls_and_purge.sql",
  "0009_analytics_consent_opt_in.sql",
  "0010_rolling_quest_windows_and_recent_verses.sql",
  "0011_bible_translation_preference.sql",
  "0012_kjv_bible_translation_default.sql",
  "0014_journey_event_identity.sql",
  "0015_transactional_daily_quest_sync.sql",
  "0016_mutable_account_sync_guards.sql",
  "0017_enforce_mutable_account_sync_boundary.sql",
  "0018_bind_account_sync_identity_and_generation.sql",
  "0019_server_ordered_account_sync_revisions.sql",
  "0020_self_service_account_deletion.sql",
  "0021_generation_bound_account_deletion.sql",
  "0022_resilient_account_deletion.sql",
  "0023_private_profile_avatars.sql",
  "0024_private_push_reminders.sql",
  "0025_stripe_test_billing.sql",
  "0026_stripe_one_time_support.sql",
  "0027_console_insights_and_audit.sql",
  "0028_stripe_lifetime_plus.sql",
];

/** Hash a migration exactly as the release manifest does. */
function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("release migration contracts", () => {
  it("keeps 0014 immutable and preserves the forward-only sync order", () => {
    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    expect(migrations).toEqual(EXPECTED_MIGRATIONS);
    expect(
      sha256(join(MIGRATIONS_DIR, "0014_journey_event_identity.sql")),
    ).toBe(JOURNEY_IDENTITY_SHA256);
    expect(migrations).not.toContain("0013_transactional_daily_quest_sync.sql");
  });

  it("keeps lifetime Plus compatible with the superseded staging migration", () => {
    const lifetime = readFileSync(
      join(
        MIGRATIONS_DIR,
        "0028_stripe_lifetime_plus.sql",
      ),
      "utf8",
    );

    expect(lifetime).toContain(
      "drop constraint if exists subscriptions_lifetime_amount_check",
    );
    expect(lifetime).toContain(
      "drop constraint if exists subscriptions_checkout_session_key",
    );
    expect(lifetime).toContain(
      "drop index if exists public.subscriptions_payment_intent_idx",
    );
  });

  it("matches the checked-in SHA-256 migration manifest", () => {
    const manifest = readFileSync(
      join(MIGRATIONS_DIR, "manifest.sha256"),
      "utf8",
    )
      .trim()
      .split("\n");
    const expected = EXPECTED_MIGRATIONS.map(
      (name) => `${sha256(join(MIGRATIONS_DIR, name))}  ${name}`,
    );

    expect(manifest).toEqual(expected);
  });

  it("keeps CAS in a client-only, tree-shakable module without server inputs", () => {
    const source = readFileSync(
      join(ROOT, "src", "lib", "sync", "daily-quests.ts"),
      "utf8",
    );

    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain(
      'import type { SupabaseClient } from "@supabase/supabase-js";',
    );
    expect(source).not.toMatch(/process\.env|service_role|supabase\/migrations/);
  });

  it("pins the RLS inventory and checked-in service-worker release contract", () => {
    const report = readFileSync(
      join(ROOT, "supabase", "evidence", "rls_policy_report.sql"),
      "utf8",
    );
    const observability = JSON.parse(
      readFileSync(join(ROOT, "config", "observability.json"), "utf8"),
    ) as { serviceWorkerVersion: string };
    const expectedTables = report.match(/    \('[a-z_]+', '[^']+'\)/g) ?? [];
    const worker = readFileSync(join(ROOT, "public", "sw.js"), "utf8");

    expect(expectedTables).toHaveLength(39);
    expect(report).toContain("('user_daily_quest_days', 'user-owned')");
    expect(report).toContain(
      "('user_sync_state', 'retained user-owned state')",
    );
    expect(report).toContain("'mutable_account_sync_contract'");
    expect(report).toContain("'account_sync_generation'");
    expect(report).toContain("'account_sync_contract'");
    expect(report).toContain("'advance_account_sync_revision'");
    expect(report).toContain("'delete_own_account'");
    expect(report).toContain("'account_deletion_contract'");
    expect(report).toContain("'profile_avatar_contract'");
    expect(report).toContain("'set_profile_avatar'");
    expect(report).toContain("'clear_profile_avatar'");
    expect(report).toContain("'push_reminder_contract'");
    expect(report).toContain("'claim_push_delivery'");
    expect(report).toContain("'complete_push_delivery'");
    expect(report).toContain("'claim_push_test'");
    expect(report).toContain("'purge_stale_push_records'");
    expect(report).toContain("'stripe_billing_contract'");
    expect(report).toContain("'claim_stripe_webhook_event'");
    expect(report).toContain("'complete_stripe_webhook_event'");
    expect(report).toContain("'claim_stripe_action'");
    expect(report).toContain("'stripe_support_contract'");
    expect(report).toContain("'claim_stripe_support_checkout'");
    expect(report).toContain("'complete_stripe_support_checkout'");
    expect(report).toContain("'console_insights'");
    expect(report).toContain("'append_console_audit_log'");
    expect(report).toContain(
      "select public.account_deletion_contract() as account_deletion_contract;",
    );
    expect(report).toContain(
      "select public.profile_avatar_contract() as profile_avatar_contract;",
    );
    expect(report).toContain(
      "select public.push_reminder_contract() as push_reminder_contract;",
    );
    expect(report).toContain(
      "select public.stripe_billing_contract() as stripe_billing_contract;",
    );
    expect(report).toContain(
      "select public.stripe_support_contract() as stripe_support_contract;",
    );
    expect(report).toContain("where schemaname = 'storage'");
    expect(report).toContain("sync_revision");
    expect(report).toContain(
      "select public.mutable_account_sync_contract() as mutable_account_sync_contract;",
    );
    expect(report).toContain(
      "select public.account_sync_contract() as account_sync_contract;",
    );
    expect(worker).toContain(
      `const CACHE_VERSION = "${observability.serviceWorkerVersion}";`,
    );
  });
});
