# Supabase migration-history and RLS rollout

This runbook covers the forward-only reconciliation migration
`0008_reassert_rls_and_purge.sql` and the rolling quest/recent-verse migration
`0010_rolling_quest_windows_and_recent_verses.sql`. It is deliberately
local/staging-first. Do not run any linked or remote command until the project
reference and exact command have been reviewed and explicitly approved.

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
| User-owned | `profiles`, `user_settings`, `user_daily_quests`, `user_quests`, `quest_completions`, `prayers`, `reflections`, `verse_bookmarks`, `user_recent_verses`, `reading_progress`, `chapters_read`, `journey_events`, `growth_events`, `user_milestones`, `notification_preferences` | Authenticated owner only. Most tables allow all owner operations; profiles have no client delete, and journey/growth events have no client update. |
| Server-owned | `subscriptions` | Authenticated owner `SELECT` only. Inserts, updates, and deletes require trusted service-role/webhook code. |
| Internal | None in `public`. Supabase-managed schemas are outside this migration. |

RLS is enabled on all 27 tables. Private prayers, reflections, recent Scripture
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
docker exec -i supabase_db_BibleQuest \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off \
  < supabase/evidence/rls_policy_report.sql
supabase db lint --local
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
```

Evidence must show 27 existing tables with `rowsecurity = true`, only the
documented policy names, no `anon` role on user/server-owned policies, and
`purge_user_data` as `security_definer = true`, `search_path=""`, anonymous
execute false, authenticated execute true. Table grants must also match the
policy commands: anonymous content reads only, authenticated least privilege,
and service-role administration. The report must also show the enabled
`keep_newest_recent_verse` trigger and its fixed-search-path, security-invoker
function with no direct anonymous or authenticated execute privilege.

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
9. Call `purge_user_data()` as A. Confirm all 15 A-owned tables are empty for A, B's rows remain, A's auth account remains, and A's server-owned subscription row remains.
10. For one A-owned recent passage, write a newer `viewed_at` and exact text from device B, then replay an older upsert for the same passage from device A. Confirm the whole newer row survives; a genuinely later upsert must still replace it.

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
is not already present, and end in the current highest version (`0010`). If it
tries to replay renamed `0002`-`0006`, stop: do not use `--include-all` and do
not repair history as a shortcut. After the push, run
`supabase/evidence/rls_policy_report.sql` in the staging SQL editor, then execute
the full two-user and anonymous plans. Exercise account sync and Clear My Data
from the staging app as an end-to-end check.

Keep staging under observation for at least one full test cycle. The production
gate requires: clean local reset, matching staging migration list, clean
evidence report, all negative tests passing, sync/purge passing, a current
production backup/PITR decision, and a written approval of the exact production
project reference and `supabase db push --linked --dry-run` output.

## Production rollout and rollback

Production is a separate manual approval. Repeat the staging sequence against
the confirmed production project: migration list, dry run, reviewed backup,
approved push, migration list, evidence SQL, then limited smoke/negative tests.
Do not seed production as part of this security migration.

```bash
supabase link --project-ref <PRODUCTION_PROJECT_REF>
supabase migration list --linked
supabase db push --linked --dry-run
# Stop here for review and explicit approval of this exact push.
supabase db push --linked
supabase migration list --linked
```

`0008` changes policies and a function but does not mutate application rows.
Rollback is forward-only:

1. If the migration fails, its transaction rolls back; capture the error and do not alter history.
2. If verification reveals a policy regression, stop application rollout and create a new, higher-numbered idempotent migration restoring the last known-safe policy/function definitions. Do not delete or edit `0008` after it has been applied.
3. If an unrelated data issue is discovered, stop writes and use the reviewed Supabase backup/PITR procedure; policy DDL itself does not require row restoration.

### When migration repair is appropriate

`supabase migration repair <version> --status applied|reverted` changes only
`supabase_migrations.schema_migrations`; it does not execute, undo, or verify
the SQL. Use it only when all of the following are true:

- `supabase migration list --linked` proves a specific history mismatch;
- catalog/schema evidence independently proves the SQL is already present (for `applied`) or absent (for `reverted`);
- the exact version, status, project reference, before/after migration lists, and recovery plan have been reviewed; and
- explicit approval has been given for that exact repair command.

Repair is not a way to deploy `0008`, fix a failed policy, or make ambiguous
renumbered migrations disappear. When schema state is uncertain, stop and
reconcile evidence before modifying history.
