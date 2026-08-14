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
  "0029_user_row_size_and_trigger_privileges.sql",
  "0030_operator_plus_grants.sql",
  "0031_stripe_subscription_conflict_key.sql",
  "0032_stripe_dispute_signal_prefix.sql",
  "0033_guided_pilgrimage_progress.sql",
  "0034_distributed_provider_rate_limits.sql",
  "0035_fix_provider_rate_limit_claim_timestamp.sql",
  "0036_arcade_store_purchases.sql",
  "0037_native_account_beta_availability.sql",
  "0038_web_account_deletion_hardening.sql",
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
    const betaReport = readFileSync(
      join(
        ROOT,
        "supabase",
        "evidence",
        "native_account_beta_report.sql",
      ),
      "utf8",
    );
    const observability = JSON.parse(
      readFileSync(join(ROOT, "config", "observability.json"), "utf8"),
    ) as { serviceWorkerVersion: string };
    const expectedTables = report.match(/    \('[a-z_]+', '[^']+'\)/g) ?? [];
    const worker = readFileSync(join(ROOT, "public", "sw.js"), "utf8");

    expect(expectedTables).toHaveLength(45);
    expect(report).toContain(
      "('account_deletion_latches', 'server-owned account deletion state')",
    );
    expect(report).toContain("('user_guided_movements', 'user-owned')");
    expect(report).toContain("('user_daily_quest_days', 'user-owned')");
    expect(report).toContain(
      "('user_sync_state', 'retained user-owned state')",
    );
    expect(report).toContain("'mutable_account_sync_contract'");
    expect(report).toContain("'account_sync_generation'");
    expect(report).toContain("'account_sync_contract'");
    expect(report).toContain("'native_account_beta_availability'");
    expect(report).toContain("'native_account_beta_request_allowed'");
    expect(report).toContain("'enforce_native_account_beta_availability'");
    expect(report).toContain("'guided_progress_sync_contract'");
    expect(report).toContain("'avatar_upload_allowed'");
    expect(report).toContain("'begin_own_account_deletion'");
    expect(report).toContain("'advance_account_sync_revision'");
    expect(report).toContain("'delete_own_account'");
    expect(report).toContain("'own_account_deletion_status'");
    expect(report).toContain("'account_deletion_contract'");
    expect(report).toContain("'account_deletion_storage_contract'");
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
    expect(report).toContain("'claim_provider_rate_limit'");
    expect(report).toContain("'provider_rate_limit_contract'");
    expect(report).toContain(
      "('provider_rate_limit_windows', 'server-owned operational')",
    );
    expect(report).toContain("'stripe_support_contract'");
    expect(report).toContain("'claim_stripe_support_checkout'");
    expect(report).toContain("'complete_stripe_support_checkout'");
    expect(report).toContain("'console_insights'");
    expect(report).toContain("'append_console_audit_log'");
    expect(report).toContain("'operator_plus_grant_contract'");
    expect(report).toContain("'grant_operator_plus'");
    expect(report).toContain("'revoke_operator_plus'");
    expect(report).toContain("'consume_arcade_question_skip'");
    expect(report).toContain("'arcade_store_contract'");
    expect(report).toContain(
      "('arcade_orders', 'server-owned financial')",
    );
    expect(report).toContain(
      "('arcade_question_skip_redemptions', 'server-owned entitlement history')",
    );
    expect(report).toContain("'enforce_user_owned_row_size'");
    expect(report).toContain("'ensure_journey_event_date_key'");
    expect(report).toContain(
      "select public.account_deletion_contract() as account_deletion_contract;",
    );
    expect(report).toContain(
      "select public.account_deletion_storage_contract()",
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
    expect(report).toContain(
      "select public.operator_plus_grant_contract() as operator_plus_grant_contract;",
    );
    expect(report).toContain("where schemaname = 'storage'");
    expect(report).toContain("sync_revision");
    expect(report).toContain(
      "select public.mutable_account_sync_contract() as mutable_account_sync_contract;",
    );
    expect(report).toContain(
      "select public.account_sync_contract() as account_sync_contract;",
    );
    expect(report).toContain(
      "select public.guided_progress_sync_contract() as guided_progress_sync_contract;",
    );
    const triggerInventory = report.slice(
      report.indexOf("-- 6."),
      report.indexOf("-- 7."),
    );
    expect(triggerInventory).toContain("'user_sync_state'");
    expect(betaReport).toContain(
      "select public.native_account_beta_availability()",
    );
    expect(betaReport).toContain("'native account beta availability'");
    expect(betaReport).toContain(
      "'enforce_native_account_beta_availability'",
    );
    expect(betaReport).toContain("'account_deletion_latches'");
    expect(betaReport).toContain("'avatar_upload_allowed'");
    expect(betaReport).toContain("'begin_own_account_deletion'");
    const guardedRelations = betaReport.match(/    \('[a-z_]+'\)/g) ?? [];
    expect(guardedRelations).toHaveLength(21);
    expect(worker).toContain(
      `const CACHE_VERSION = "${observability.serviceWorkerVersion}";`,
    );
  });
});
