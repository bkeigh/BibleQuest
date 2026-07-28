# Supabase migration-history and RLS rollout

This runbook covers the forward-only reconciliation migration
`0008_reassert_rls_and_purge.sql` and the rolling quest/recent-verse migration
`0010_rolling_quest_windows_and_recent_verses.sql`, through the current Bible
preference/bookmark migration `0011_bible_translation_preference.sql`, the KJV
default migration `0012_kjv_bible_translation_default.sql`, immutable Journey
identity `0014_journey_event_identity.sql`, and transactional daily-quest
migration `0015_transactional_daily_quest_sync.sql`, followed by the reviewed
account-sync and deletion boundary `0016` through `0022`, sealed avatar/push
and billing/support/console boundaries `0023` through `0027`, and lifetime
Plus billing `0028`, user-row/trigger hardening `0029`, and sealed operator Plus
grants `0030`. It is
deliberately local/staging-first. Do not run any linked or remote command until
the project reference and exact command have been reviewed and explicitly
approved.

## Why the migration history can diverge

Supabase compares the filename version prefix in `supabase/migrations/` with
`supabase_migrations.schema_migrations`; Git rename history is not consulted.
The repository timeline is:

| Date | Commit | Migration event |
| --- | --- | --- |
| 2026-07-07 | `23b2347` | Added `0001_init.sql`; policies were a separate `supabase/policies.sql`. |
| 2026-07-08 | `8e18648` | Added `0002_chapters_read_unique.sql`. |
| 2026-07-09 | `ba12e0` | Added `0002_multi_daily_quests.sql`, reusing version `0002`. |
| 2026-07-09 | `7bb5a83` | Added `0003_user_language.sql`. |
| 2026-07-09 | `6db3830` | Added `0004_purge_user_data.sql`. |
| 2026-07-09 | `f14110f` | Updated the existing `0004_purge_user_data.sql` to revoke anonymous execution. |
| 2026-07-14 | `8bad216` | Added numbered RLS as `0002_rls_policies.sql`, renamed the earlier files to `0003` through `0006`, and added `0007_user_quests.sql`. |
| 2026-07-16 | current change | Adds only `0008_reassert_rls_and_purge.sql`; existing migrations remain unchanged. |
| 2026-07-16 | later local change | Adds `0009_analytics_consent_opt_in.sql` after the RLS reconciliation. |
| 2026-07-17 | launch content/lifecycle pass | Adds `0010_rolling_quest_windows_and_recent_verses.sql`: rolling 24-hour quest timestamps, owner-only recent verses, an idempotent daily-passage key, and a complete purge definition. |
| 2026-07-18 | Bible edition sync pass | Adds `0011_bible_translation_preference.sql`: account-backed Bible preference, bookmark translation key, and translation-aware bookmark uniqueness. |
| 2026-07-20 | KJV default pass | Adds `0012_kjv_bible_translation_default.sql`: new account settings default to the app's keyless KJV edition; existing choices are unchanged. |
| 2026-07-21 | Journey identity release | Adds immutable `0014_journey_event_identity.sql` with SHA-256 `9497b745c5efc0c3f6c4c82e43e57c4fd9b34e8cfae12e6193226d564da50789`. |
| 2026-07-21 | Daily-quest CAS pass | Re-versions the reviewed but untracked local `0013` work as `0015_transactional_daily_quest_sync.sql`: owner-RLS day revisions, authenticated atomic replacement, bounded duplicate-request protection, completed-state preservation, legacy-client revision tracking, and complete purge coverage. `0013` remains absent because no immutable linked history proved insertion below `0014` safe. |
| 2026-07-23 | Account boundary hardening | Adds `0016`–`0019`: mutable-row guards, an enforced account boundary, identity/generation binding, and server-ordered revisions. |
| 2026-07-23 | Resilient self-service deletion | Adds `0020`–`0022`: authenticated self-service deletion, generation-bound deletion, and resilient cleanup. |
| 2026-07-24 | Private account features | Adds `0023`–`0024`: sealed profile avatars and private push-reminder state. |
| 2026-07-25 | Server-owned commerce and console | Adds `0025`–`0027`: test billing, one-time support, aggregate console insights, and append-only operator audit. |
| 2026-07-27 | Lifetime Plus | Adds `0028`: sealed one-time/lifetime Stripe projection fields and the v2 billing contract. |
| 2026-07-28 | Sync resource hardening | Adds `0029`: a one-MiB cap on every generation-bound row and removes direct Data API access to trigger helpers. |
| 2026-07-28 | Operator Plus grants | Adds `0030`: sealed manual entitlement history, atomic grant/revoke RPCs, and append-only operator auditing. |

If a database recorded an old `0002`, `0003`, or `0004` before the renames,
the later filenames do not change those recorded versions. Conversely, a
database that recorded the new numbering can disagree with a checkout that
still has the old names. Reusing a version for different SQL is especially
ambiguous because migration comparison is version-based. The new `0008`
converges policy and purge state without claiming anything about the older
history rows.

## Frozen production legacy history and forward packet

The read-only July 27 production audit proved that project
`iacnjqnssovaaojswjoh` records 23 timestamped migrations ending at
`20260723160600_resilient_account_deletion`, which maps through repository
`0022`. The live database separately passes the reviewed `0023`–`0027`
avatar, push, billing v1, support, and console boundaries, but those changes
are not present as migration-history rows. Lifetime columns are absent,
`stripe_billing_contract()` still reports
`biblequest_stripe_test_billing_v1`, and `subscriptions` has zero rows.

Do not run normal `supabase db push` against that project: the checked-in
numbered history and frozen timestamped production history intentionally
disagree, and the CLI correctly refuses the push. Do not run
`migration repair`, `--include-all`, replay old migrations, delete history, or
reset Production.

For this one convergence, use
`scripts/reconcile-production-lifetime-migration.mjs`. It creates a disposable
Supabase workdir containing exact markers for the immutable production
history, then proposes one higher timestamped migration:
`20260727193000_reconcile_launch_contracts_and_lifetime_plus.sql`. The packet:

1. requires the exact production project and legacy history;
2. requires a completed physical backup less than 30 hours old;
3. requires zero subscription rows and no partial lifetime columns;
4. re-verifies the complete `0023`–`0027` security contracts;
5. applies checked-in `0028` only when its pinned SHA-256 matches; and
6. verifies the v2 billing contract in the same transaction.

The dry run is non-mutating:

```bash
pnpm check:production-lifetime-migration
```

It must report exactly one proposed packet and `"applied":false`. The real
push remains a separate production-owner approval:

```bash
BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM='apply 20260727193000 to iacnjqnssovaaojswjoh' \
  node scripts/reconcile-production-lifetime-migration.mjs --apply
```

It must report `"applied":true`, after which the production readiness probe,
RLS report, anonymous-denial checks, and limited signed-in checks must all be
rerun. The packet adds one honest forward migration row; it does not rewrite
or relabel any earlier production history.

### Production 0029 user-row hardening packet

Production records the lifetime packet above as applied. Migration `0029` must
therefore use the next reviewed forward-only packet rather than the normal
repository migration path. Use
`scripts/reconcile-production-user-row-hardening.mjs`; it creates a disposable
Supabase workdir containing the exact frozen legacy history and the applied
lifetime marker, then proposes only
`20260728191500_user_row_size_and_trigger_privileges.sql`. The packet:

1. requires the exact production project and reviewed history through the
   lifetime packet;
2. requires a completed physical backup less than 30 hours old;
3. rejects a partially installed function or trigger set;
4. requires all 16 protected sync tables to exist with RLS enabled and rejects
   any existing protected row larger than one MiB;
5. applies checked-in `0029` only when its pinned SHA-256 matches; and
6. verifies the complete trigger set, fixed function posture, and revoked
   Data API execution privileges in the same transaction.

The dry run is non-mutating and must propose exactly one packet:

```bash
pnpm check:production-user-row-hardening
```

Apply only after reviewing that output and the named backup:

```bash
BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM='apply 20260728191500 to iacnjqnssovaaojswjoh' \
  node scripts/reconcile-production-user-row-hardening.mjs --apply
```

The apply must report `"applied":true`. Rerun the same command in dry-run mode;
it must then report an empty proposed set and `"applied":true`. Follow with the
production migration list, RLS/readiness checks, anonymous denials, and the
limited signed-in smoke plan. Never substitute `db push --include-all`,
normal linked `db push`, or migration-history repair.

#### July 28, 2026 production execution record

The reviewed production owner approval was executed at approximately
`2026-07-28T19:37Z` against project `iacnjqnssovaaojswjoh`:

- the current completed physical backup was
  `2026-07-28T07:57:26.423Z`;
- the applied packet was
  `20260728191500_user_row_size_and_trigger_privileges.sql`;
- the pinned `0029` source SHA-256 was
  `65f9c340e7733696f220f2fc92b0cdc486098f7e4bcde1a03ec6b999784fc4be`;
- the guarded apply reported `"applied":true`;
- the immediate guarded dry run reported `"proposed":[]` and
  `"applied":true`; and
- linked public-schema lint reported no schema errors.

The packet transaction's postflight also proved all 16 active row-size
triggers, the security-invoker/fixed-search-path function posture, and no
anonymous, authenticated, or service-role execution privilege on either
trigger helper. This record contains no credentials, user rows, or private
catalog output.

### Production 0030 operator Plus packet

Migration `0030` uses the next isolated forward-only packet described in
[`CONSOLE_PLUS_GRANTS.md`](CONSOLE_PLUS_GRANTS.md). Run
`pnpm check:production-operator-plus`, review the exact single packet and named
fresh physical backup, then apply only with the pinned confirmation string.
Never substitute normal linked `db push`, `--include-all`, or migration repair.

## Complete public-table inventory

| Classification | Tables | Intended access |
| --- | --- | --- |
| Public content | `faith_providers`, `bible_translations`, `bible_books`, `bible_chapters`, `bible_verses`, `daily_verses`, `quest_templates`, `prayer_prompts`, `reflection_prompts`, `milestones`, `feature_flags` | Anonymous and authenticated `SELECT` only. Reads are limited to active/approved content; disabled feature flags are hidden. No client writes. Prompt tables contain generic seed prompts, not a user's prayer or reflection text. |
| User-owned | `profiles`, `user_sync_state`, `user_settings`, `user_daily_quests`, `user_daily_quest_days`, `user_quests`, `quest_completions`, `prayers`, `reflections`, `verse_bookmarks`, `user_recent_verses`, `reading_progress`, `chapters_read`, `journey_events`, `growth_events`, `user_milestones`, `notification_preferences` | Authenticated owner only. Most tables allow bounded owner operations; sync revisions and destructive account actions stay behind reviewed RPCs. |
| Server-managed user state | `push_reminder_preferences`, `push_subscriptions`, `push_deliveries` | Normal users can reach only the reviewed owner-scoped functions or projections; delivery mutation is service-role only. |
| Server-owned | `subscriptions`, `push_test_claims`, `stripe_customers`, `stripe_webhook_events`, `stripe_action_claims`, `stripe_billing_signals`, `stripe_support_payments`, `console_audit_logs`, `operator_plus_grants` | Only documented owner projections are client-readable. Provider identifiers, money, webhook state, test claims, operator audit, and manual entitlement history remain sealed behind server boundaries. |
| Internal | Supabase-managed schemas remain outside the public-table inventory. Private avatar objects use the sealed `storage.objects` policies and non-public bucket. |

RLS is enabled on all 40 tables. Private prayers, reflections, recent Scripture
history, notes, and
journey data have no anonymous policy and every authenticated policy includes
an `auth.uid()` owner condition.

## Local clean-database verification

Prerequisites: Supabase CLI and a running Docker-compatible daemon. These
commands target the local stack only; do not add `--linked` or `--db-url`.

```bash
supabase start
supabase db reset
supabase migration list --local
supabase test db --local supabase/tests/0014_journey_event_identity.sql
supabase test db --local supabase/tests/0015_daily_quest_cas.sql
docker exec -i supabase_db_BibleQuest \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off \
  < supabase/evidence/rls_policy_report.sql
supabase db lint --local --schema public --level warning --fail-on warning
```

Expected migration order:

```text
0001_init.sql
0002_rls_policies.sql
0003_chapters_read_unique.sql
0004_multi_daily_quests.sql
0005_user_language.sql
0006_purge_user_data.sql
0007_user_quests.sql
0008_reassert_rls_and_purge.sql
0009_analytics_consent_opt_in.sql
0010_rolling_quest_windows_and_recent_verses.sql
0011_bible_translation_preference.sql
0012_kjv_bible_translation_default.sql
0014_journey_event_identity.sql
0015_transactional_daily_quest_sync.sql
0016_mutable_account_sync_guards.sql
0017_enforce_mutable_account_sync_boundary.sql
0018_bind_account_sync_identity_and_generation.sql
0019_server_ordered_account_sync_revisions.sql
0020_self_service_account_deletion.sql
0021_generation_bound_account_deletion.sql
0022_resilient_account_deletion.sql
0023_private_profile_avatars.sql
0024_private_push_reminders.sql
0025_stripe_test_billing.sql
0026_stripe_one_time_support.sql
0027_console_insights_and_audit.sql
0028_stripe_lifetime_plus.sql
0029_user_row_size_and_trigger_privileges.sql
```

Evidence must show all 40 expected tables with `rowsecurity = true`, only the
documented policy names, no `anon` role on user/server-owned policies, and
`purge_user_data` as `security_definer = true`, `search_path=""`, anonymous
execute false, authenticated execute true. Table grants must also match the
policy commands: anonymous content reads only, authenticated least privilege,
and service-role administration. The report must also show the enabled
`keep_newest_recent_verse` trigger and its fixed-search-path, security-invoker
function with no direct anonymous or authenticated execute privilege.
Verify that `user_settings.preferred_bible_translation` and
`verse_bookmarks.translation_key` exist, and that
`verse_bookmarks_passage_translation_key` is the active translation-aware
unique index.
It must also show that `user_daily_quest_days` exposes only
`assigned_date`/`revision` to authenticated clients, its owner-only SELECT
policy is active, `replace_user_daily_quests` is authenticated-only SECURITY
DEFINER with `search_path=""`, and both non-callable legacy trigger functions
are installed. The anonymous `daily_quest_sync_contract` readiness RPC must
return only its fixed contract identity and `ok: true`. The 15 Journey identity
and 59 CAS/contract database tests must pass, including the pinned `0014`
migration, without selecting application rows into evidence.

## Two-user negative tests

Create two staging-only accounts A and B. Record their UUIDs, obtain normal
authenticated sessions for each, and use the anon key plus each user's access
token through the same PostgREST/Supabase client path as the app. Never use the
service-role key for these tests.

For every user-owned table, first create the minimum valid A-owned and B-owned
fixtures using the matching owner's session. Then test:

1. As A, `SELECT` A's row succeeds and `SELECT` B's primary key returns zero rows.
2. As A, `INSERT` with A's UUID succeeds where inserts are supported; inserting B's UUID fails RLS.
3. As A, `UPDATE` A's row succeeds where updates are supported; targeting B's row changes zero rows, and changing A's owner column to B fails `WITH CHECK`.
4. As A, `DELETE` A's row succeeds where deletes are supported; targeting B's row changes zero rows.
5. Confirm profile delete and journey/growth update fail even for the owner.
6. Repeat the cross-owner checks as B against A to catch asymmetric fixtures or tokens.
7. For `subscriptions`, both users can select only their own row; all client insert/update/delete attempts fail. Create subscription fixtures only with a trusted staging admin/service-role path.
8. Put unique sentinel text in A and B prayer/reflection bodies. Confirm neither account can retrieve the other's sentinel in any response, error, log, or evidence output.
9. Call `purge_user_data()` as A. Confirm all 16 A-owned tables are empty for A, B's rows remain, A's auth account remains, and A's server-owned subscription row remains.
10. For one A-owned recent passage, write a newer `viewed_at` and exact text from device B, then replay an older upsert for the same passage from device A. Confirm the whole newer row survives; a genuinely later upsert must still replace it.
11. Pull A's daily-quest revision and rows on two devices, apply different picks from the same revision, and confirm the stale call returns canonical rows without mutation. Merge/retry and confirm both picks remain.
12. Replay one daily-quest request UUID and confirm its revision advances once. Unpick an unfinished row and confirm it stays deleted; replay an empty/stale day against a completed row and confirm completion survives.
13. As A and B, verify `user_daily_quest_days` hides the other owner and disallows direct revision writes. Confirm the RPC ignores caller ownership because no owner argument exists, anonymous execution fails, and Clear My Data removes the owner's revision metadata only.

## Anonymous-access tests

Using only the Supabase URL and anon key with no user JWT:

1. `SELECT` each public-content table. Only active/approved rows should return; inactive translations/providers and their books/chapters/verses, unapproved quests, inactive prompts/milestones, and disabled flags must not return.
2. Attempt insert/update/delete on every public-content table; each must fail.
3. Attempt select/insert/update/delete on every user-owned table and `subscriptions`; each must return no private rows or fail RLS.
4. Call `purge_user_data()`; execution must be denied before function logic runs.
5. Confirm generic `prayer_prompts` and `reflection_prompts` are readable, while private `prayers` and `reflections` are not.

## Staging rollout gate

The following commands touch a remote staging project and require explicit
approval immediately before execution. First confirm the CLI is linked to the
staging project reference, not production.

```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase migration list --linked
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
```

Before the real push, save the `migration list` and dry-run output. The dry run
must propose only the intended pending migration(s), including `0008` when it
is not already present, contain no `0013`, and end in the current highest
version (`0015`). If it tries to replay renamed `0002`-`0006`, stop: do not use
`--include-all` and do not repair history. After the push, run
`supabase/evidence/rls_policy_report.sql` in the staging SQL editor, then execute
the full two-user and anonymous plans. Exercise account sync and Clear My Data
from the staging app as an end-to-end check.

Keep staging under observation for at least one full test cycle. The production
gate requires: clean local reset, matching staging migration list, clean
evidence report, all negative tests passing, sync/purge passing, a current
production backup/PITR decision, and a written approval of the exact production
project reference and `supabase db push --linked --dry-run` output. Reconcile
the reviewed content seed only after this schema/RLS phase passes, using the
separate procedure in [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md).

## Production rollout and rollback

Production is a separate manual approval. For the currently frozen legacy
history, use only the forward packet described above: guarded dry run, reviewed
backup, approved apply, migration list, evidence SQL, then limited
smoke/negative tests.
Keep this schema/RLS approval separate from the frozen idempotent content seed;
follow [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md) only after the
schema evidence passes, and verify content counts separately.
Use the exact natural-key/content-hash manifest checks in
[`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md); counts alone are not
content parity.

```bash
pnpm check:production-lifetime-migration
pnpm check:production-user-row-hardening
# Stop here for review and explicit approval of the exact pending packet.
BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM='apply 20260728191500 to iacnjqnssovaaojswjoh' \
  node scripts/reconcile-production-user-row-hardening.mjs --apply
pnpm check:production-user-row-hardening
```

`0008` changes policies and a function, `0010` backfills quest timestamps and
deduplicates daily content before adding its unique key, and `0011` is additive
apart from replacing bookmark uniqueness with a translation-aware index.
`0012` changes only the default for new settings rows. `0014` adds the accepted
Journey identity. `0015` is additive except for replacing `purge_user_data`; it
backfills opaque revisions from existing assignment days and installs the
authenticated CAS/legacy triggers. The
seed upserts reviewed public content. Rollback is forward-only:

1. If the migration fails, its transaction rolls back; capture the error and do not alter history.
2. If verification reveals a policy regression, stop application rollout and create a new, higher-numbered idempotent migration restoring the last known-safe policy/function definitions. Do not delete or edit `0008` after it has been applied.
3. If an unrelated data issue is discovered, stop writes and use the reviewed Supabase backup/PITR procedure; policy DDL itself does not require row restoration.

### Migration repair is not authorized

Do not run `supabase migration repair` for this release. A history mismatch,
unexpected `0013`, replay of renamed `0002`-`0006`, or any disagreement with
the immutable `0014` identity is a hard stop. Preserve every applied migration
and correct a verified schema defect only with a separately reviewed, higher
forward migration after the authoritative histories are reconciled.
