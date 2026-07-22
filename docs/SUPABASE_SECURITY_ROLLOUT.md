# Supabase migration-history and RLS rollout

This runbook covers the forward-only reconciliation migration
`0008_reassert_rls_and_purge.sql` and the rolling quest/recent-verse migration
`0010_rolling_quest_windows_and_recent_verses.sql`, through the current Bible
preference/bookmark migration `0011_bible_translation_preference.sql`, the KJV
default migration `0012_kjv_bible_translation_default.sql`, immutable Journey
identity `0014_journey_event_identity.sql`, transactional daily-quest migration
`0015_transactional_daily_quest_sync.sql`, mutable-write guards
`0016_mutable_account_sync_guards.sql`, cached-client enforcement
`0017_enforce_mutable_account_sync_boundary.sql`, followed by retained account
identity/generation binding in
`0018_bind_account_sync_identity_and_generation.sql`, and server-ordered row
revisions in `0019_server_ordered_account_sync_revisions.sql`. It is
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
| 2026-07-22 | Mutable account guards | Adds `0016_mutable_account_sync_guards.sql`: authenticated owner-derived conditional writes for profiles, settings, notification preferences, prayers, and reflections with content-free acknowledgements. |
| 2026-07-22 | Cached-client update boundary | Adds `0017_enforce_mutable_account_sync_boundary.sql`: authenticated direct UPDATE is revoked on the five guarded tables while the definer RPC and intended SELECT/INSERT/DELETE grants remain available. |
| 2026-07-22 | Account identity and generation boundary | Adds `0018_bind_account_sync_identity_and_generation.sql`: retained owner generation, expected-user/generation wrappers, guarded shelf/reading writes, bounded owner-only tombstones, idempotent generation-bumping purge, safe blank-profile claim, and cached-client rejection after generation advances. |
| 2026-07-22 | Server-ordered mutable revisions | Adds `0019_server_ordered_account_sync_revisions.sql`: database-owned per-row revisions for nine conflict-bearing resources, database-owned `server_seen_at` ordering for the bounded recent-passage list, exact attributable CAS acknowledgements, removal of client-clock write authority, and fail-closed retirement of direct browser mutations. |

If a database recorded an old `0002`, `0003`, or `0004` before the renames,
the later filenames do not change those recorded versions. Conversely, a
database that recorded the new numbering can disagree with a checkout that
still has the old names. Reusing a version for different SQL is especially
ambiguous because migration comparison is version-based. The new `0008`
converges policy and purge state without claiming anything about the older
history rows.

## Complete public-table inventory

| Classification | Tables | Intended access |
| --- | --- | --- |
| Public content | `faith_providers`, `bible_translations`, `bible_books`, `bible_chapters`, `bible_verses`, `daily_verses`, `quest_templates`, `prayer_prompts`, `reflection_prompts`, `milestones`, `feature_flags` | Anonymous and authenticated `SELECT` only. Reads are limited to active/approved content; disabled feature flags are hidden. No client writes. Prompt tables contain generic seed prompts, not a user's prayer or reflection text. |
| User-owned | `profiles`, `user_sync_state`, `user_settings`, `user_daily_quests`, `user_daily_quest_days`, `user_quests`, `quest_completions`, `prayers`, `reflections`, `verse_bookmarks`, `user_recent_verses`, `reading_progress`, `chapters_read`, `journey_events`, `growth_events`, `user_milestones`, `notification_preferences` | Authenticated owner only. `account_sync_generation(expected_user_id)` atomically validates the captured identity and returns only `{"generation":n}`; raw state exposes only `generation`/`updated_at`. `user_daily_quest_days` exposes only `assigned_date`/`revision`. Generation-bound RPCs own destructive writes, while the v4 mutable RPC owns per-row revision CAS for the nine conflict-bearing resources; cached direct mutations fail closed. |
| Server-owned | `subscriptions` | Authenticated owner `SELECT` only. Inserts, updates, and deletes require trusted service-role/webhook code. |
| Internal | None in `public`. Supabase-managed schemas are outside this migration. |

RLS is enabled on all 29 tables. Private prayers, reflections, recent Scripture
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
supabase test db --local supabase/tests/0016_mutable_account_sync_guards.sql
supabase test db --local supabase/tests/0017_mutable_account_sync_boundary.sql
supabase test db --local supabase/tests/0018_account_sync_generation.sql
supabase test db --local supabase/tests/0019_server_ordered_account_sync_revisions.sql
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
```

Evidence must show 29 existing tables with `rowsecurity = true`, only the
documented policy names, no `anon` role on user/server-owned policies, and
`purge_user_data` as `security_definer = true`, `search_path=""`, anonymous
execute false, authenticated execute true. Table grants must also match the
effective boundary: anonymous content reads only; authenticated direct INSERT,
UPDATE, and DELETE are absent on profiles, settings, notification preferences,
prayers, reflections, shelf quests, reading progress, bookmarks, and recent
verses; and
service-role administration retains all privileges. The report must also show the enabled
nine-table `advance_account_sync_revision` trigger and its fixed-search-path,
security-invoker function with no direct browser or service-role execute
privilege; the timestamp-authority `keep_newest_recent_verse` trigger must be absent.
Verify that `user_settings.preferred_bible_translation` and
`verse_bookmarks.translation_key` exist, and that
`verse_bookmarks_passage_translation_key` is the active translation-aware
unique index.
It must also show that `user_daily_quest_days` exposes only
`assigned_date`/`revision` to authenticated clients, its owner-only SELECT
policy is active, `replace_user_daily_quests` is authenticated-only SECURITY
DEFINER with `search_path=""`, and both non-callable legacy trigger functions
are installed. The anonymous `daily_quest_sync_contract` and
`mutable_account_sync_contract` and `account_sync_contract` readiness RPCs must
each return only their fixed contract identity and `ok: true`. The v4 contract
must be exactly `{"contract":"biblequest_account_sync_v4","ok":true}`.
The authenticated `account_sync_generation(expected_user_id)` RPC must reject a
session/captured-user mismatch and return exactly `{"generation":n}` otherwise.
The 15 Journey identity, 59 CAS/contract, 19 mutable guard, 34 cached-client
boundary, 51 identity/generation, and 41 server-revision database tests must pass, including
the pinned `0014` migration, without selecting application rows into evidence.

## Two-user negative tests

Create two staging-only accounts A and B. Record their UUIDs, obtain normal
authenticated sessions for each, and use the anon key plus each user's access
token through the same PostgREST/Supabase client path as the app. Never use the
service-role key for these tests.

For every user-owned table, first create the minimum valid A-owned and B-owned
fixtures using the matching owner's session. Then test:

1. As A, `SELECT` A's row succeeds and `SELECT` B's primary key returns zero rows.
2. As A, direct INSERT/UPDATE/DELETE on each of the nine revisioned resources fails even with A's UUID; inserting B's UUID through any supported non-revisioned path fails RLS.
3. As A, call guarded writes with A's captured UUID, retained generation, and exact per-row revision. Matching revisions apply and advance once; stale revisions and A/B identity swaps fail. Ahead, behind, and equal device timestamps never change the CAS decision, and no acknowledgement exposes row content.
4. Delete prayers, reflections, bookmarks, shelf quests, and recent verses only through `delete_user_sync_rows(expected_user_id, expected_generation, request_id, deletions)`. Confirm at most 200 tombstones, owner scoping, exact retry idempotency, and one generation advance.
5. Confirm profile delete and journey/growth update fail even for the owner.
6. Repeat the cross-owner checks as B against A to catch asymmetric fixtures or tokens.
7. For `subscriptions`, both users can select only their own row; all client insert/update/delete attempts fail. Create subscription fixtures only with a trusted staging admin/service-role path.
8. Put unique sentinel text in A and B prayer/reflection bodies. Confirm neither account can retrieve the other's sentinel in any response, error, log, or evidence output.
9. Call `purge_user_data(A_UUID, generation, request_id)` as A. Confirm all 16 purgeable A-owned tables are empty, B's rows remain, A's auth account and `user_sync_state` remain, generation advances once, and an exact request retry does not advance it again.
10. For one A-owned recent passage, write from device B, then replay a different row from a device 24 hours ahead using B's now-stale revision. Confirm it conflicts regardless of `viewed_at`; after rebase, the next exact revision applies and all devices converge. Create more than 20 distinct recent passages across ahead/behind clocks and confirm database-owned `server_seen_at`, not `viewed_at`, determines the canonical cap while a new local intent is still offered to CAS.
11. Pull A's generation, daily-quest revision, and rows on two devices. Apply different picks using the captured UUID/generation and same revision; confirm the stale revision returns canonical rows without mutation. Merge/retry and confirm both picks remain.
12. Replay one daily-quest request UUID and confirm its revision advances once. Unpick an unfinished row and confirm it stays deleted; replay an empty/stale day against a completed row and confirm completion survives.
13. As A and B, verify `user_daily_quest_days` and `user_sync_state` hide raw owner/history columns and the other owner. Read generation through `account_sync_generation(captured_user_id)` and confirm an A/B session swap fails before returning it. Confirm all wrappers require the exact authenticated UUID, anonymous execution fails, and Clear My Data removes revision metadata while retaining only the advanced sync generation.

## Anonymous-access tests

Using only the Supabase URL and anon key with no user JWT:

1. `SELECT` each public-content table. Only active/approved rows should return; inactive translations/providers and their books/chapters/verses, unapproved quests, inactive prompts/milestones, and disabled flags must not return.
2. Attempt insert/update/delete on every public-content table; each must fail.
3. Attempt select/insert/update/delete on every user-owned table and `subscriptions`; each must return no private rows or fail RLS.
4. Call the generation-bound `purge_user_data` wrapper; execution must be denied before function logic runs.
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
version (`0019`). If it tries to replay renamed `0002`-`0006`, stop: do not use
`--include-all` and do not repair history. After the push, run
`supabase/evidence/rls_policy_report.sql` in the staging SQL editor, then execute
the full two-user and anonymous plans. Exercise account sync and Clear My Data
from the staging app as an end-to-end check.

For the July 31 staging cutover, Production/main remains guest-only and never
ran v3 account sync. The superseded v3 Preview is synthetic-only and must never
be promoted. Close every old v3 Preview client, then re-prove the synthetic
staging `auth.users` count is exactly zero immediately before `0019`; the first
read-only check recorded zero. If the repeat count is nonzero or any signed-in
v3 client may remain, stop and require either a reviewed two-phase v3/v4 bridge
or an explicit reset/data-disposition decision. Do not represent a service-
worker refresh as preservation of unsynced v3 data.

Keep staging under observation for at least one full test cycle. The production
gate requires: clean local reset, matching staging migration list, clean
evidence report, all negative tests passing, sync/purge passing, a current
production backup/PITR decision, and a written approval of the exact production
project reference and `supabase db push --linked --dry-run` output. Reconcile
the reviewed content seed only after this schema/RLS phase passes, using the
separate procedure in [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md).

## Production rollout and rollback

Production is a separate manual approval. Repeat the staging sequence against
the confirmed production project: migration list, dry run, reviewed backup,
approved push, migration list, evidence SQL, then limited smoke/negative tests.
Keep this schema/RLS approval separate from the frozen idempotent content seed;
follow [`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md) only after the
schema evidence passes, and verify content counts separately.
Use the exact natural-key/content-hash manifest checks in
[`ACCOUNT_SYNC_RUNBOOK.md`](ACCOUNT_SYNC_RUNBOOK.md); counts alone are not
content parity.

```bash
supabase link --project-ref iacnjqnssovaaojswjoh
supabase migration list --linked
supabase db push --linked --dry-run
# Stop here for review and explicit approval of this exact push.
supabase db push --linked
supabase migration list --linked
```

`0008` changes policies and a function, `0010` backfills quest timestamps and
deduplicates daily content before adding its unique key, and `0011` is additive
apart from replacing bookmark uniqueness with a translation-aware index.
`0012` changes only the default for new settings rows. `0014` adds the accepted
Journey identity. `0015` is additive except for replacing `purge_user_data`; it
backfills opaque revisions from existing assignment days and installs the
authenticated CAS/legacy triggers. The `0016` RPC is additive and rejects
stale or cross-owner mutable account writes.
`0017` revokes authenticated direct UPDATE on the five guarded mutable tables;
`0018` retires every unbound security-definer write signature, adds retained
generation and sixteen enforcement triggers, expands guarded updates to shelf
and reading progress, and routes the five tombstone resources through one
bounded generation-bumping RPC. `0019` gives all nine conflict-bearing rows
database-owned revisions, replaces timestamp guards with attributable per-row
CAS, revokes their remaining direct browser mutations, and retires the recent-
verse timestamp trigger. It adds database-owned `server_seen_at` ordering for
the bounded recent-passage list. Service-role administration remains.
The seed upserts reviewed public content. Rollback is forward-only:

1. If the migration fails, its transaction rolls back; capture the error and do not alter history.
2. If verification reveals a policy regression, stop application rollout and create a new, higher-numbered idempotent migration restoring the last known-safe policy/function definitions. Do not delete or edit `0008` after it has been applied.
3. If an unrelated data issue is discovered, stop writes and use the reviewed Supabase backup/PITR procedure; policy DDL itself does not require row restoration.

### Migration repair is not authorized

Do not run `supabase migration repair` for this release. A history mismatch,
unexpected `0013`, replay of renamed `0002`-`0006`, or any disagreement with
the immutable `0014` identity is a hard stop. Preserve every applied migration
and correct a verified schema defect only with a separately reviewed, higher
forward migration after the authoritative histories are reconciled.
