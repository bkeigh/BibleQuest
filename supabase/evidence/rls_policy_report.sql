-- Sanitized RLS evidence for BibleQuest.
-- This script reads PostgreSQL catalogs only. It does not select application
-- rows, prayer/reflection text, profile data, or billing data.

-- 1. Every expected public table, its classification, and RLS flags.
with expected (table_name, classification) as (
  values
    ('faith_providers', 'public content'),
    ('bible_translations', 'public content'),
    ('bible_books', 'public content'),
    ('bible_chapters', 'public content'),
    ('bible_verses', 'public content'),
    ('daily_verses', 'public content'),
    ('quest_templates', 'public content'),
    ('prayer_prompts', 'public content'),
    ('reflection_prompts', 'public content'),
    ('milestones', 'public content'),
    ('feature_flags', 'public content'),
    ('profiles', 'user-owned'),
    ('user_sync_state', 'retained user-owned state'),
    ('user_settings', 'user-owned'),
    ('user_daily_quests', 'user-owned'),
    ('user_daily_quest_days', 'user-owned'),
    ('user_quests', 'user-owned'),
    ('quest_completions', 'user-owned'),
    ('prayers', 'user-owned'),
    ('reflections', 'user-owned'),
    ('verse_bookmarks', 'user-owned'),
    ('user_recent_verses', 'user-owned'),
    ('reading_progress', 'user-owned'),
    ('chapters_read', 'user-owned'),
    ('journey_events', 'user-owned'),
    ('growth_events', 'user-owned'),
    ('user_milestones', 'user-owned'),
    ('notification_preferences', 'user-owned'),
    ('subscriptions', 'server-owned')
)
select
  expected.table_name,
  expected.classification,
  class.oid is not null as table_exists,
  coalesce(class.relrowsecurity, false) as rowsecurity,
  coalesce(class.relforcerowsecurity, false) as force_rowsecurity
from expected
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = 'public'
left join pg_catalog.pg_class as class
  on class.relnamespace = namespace.oid
 and class.relname = expected.table_name
 and class.relkind in ('r', 'p')
order by expected.classification, expected.table_name;

-- 2. Exact policy commands, roles, USING expressions, and WITH CHECK
-- expressions. Expected role rules: content SELECT -> anon/authenticated;
-- owner policies and subscription SELECT -> authenticated only.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
from pg_catalog.pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Policy counts make missing or unexpected policy names easy to spot.
select
  tables.tablename,
  count(policies.policyname) as policy_count,
  coalesce(
    array_agg(policies.policyname order by policies.policyname)
      filter (where policies.policyname is not null),
    '{}'::name[]
  ) as policy_names
from pg_catalog.pg_tables as tables
left join pg_catalog.pg_policies as policies
  on policies.schemaname = tables.schemaname
 and policies.tablename = tables.tablename
where tables.schemaname = 'public'
group by tables.tablename
order by tables.tablename;

-- 4. Security-definer account functions must have an empty fixed search_path
-- and the exact intended API-role execution posture.
select
  procedure.proname as function_name,
  procedure.prosecdef as security_definer,
  procedure.proconfig as function_settings,
  pg_catalog.has_function_privilege(
    'anon', procedure.oid, 'EXECUTE'
  ) as anon_can_execute,
  pg_catalog.has_function_privilege(
    'authenticated', procedure.oid, 'EXECUTE'
  ) as authenticated_can_execute,
  pg_catalog.has_function_privilege(
    'service_role', procedure.oid, 'EXECUTE'
  ) as service_role_can_execute,
  pg_catalog.pg_get_function_identity_arguments(procedure.oid) as arguments
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'purge_user_data',
    'purge_user_data_internal',
    'replace_user_daily_quests',
    'replace_user_daily_quests_internal',
    'daily_quest_sync_contract',
    'upsert_mutable_account_rows',
    'upsert_mutable_account_rows_internal',
    'mutable_account_sync_contract',
    'delete_user_sync_rows',
    'account_sync_generation',
    'account_sync_contract',
    'assert_user_sync_context',
    'enforce_user_sync_generation',
    'advance_account_sync_revision',
    'handle_new_user',
    'bump_daily_quest_revision_for_legacy_write',
    'preserve_daily_quest_completion_for_legacy_write'
  )
order by procedure.proname;

-- 5. Effective table grants for API roles. Expected: anon SELECT on public
-- content only; authenticated least-privilege access matching its policies;
-- service_role all table privileges; no client TRUNCATE/TRIGGER/REFERENCES.
select
  grantee,
  table_name,
  array_agg(privilege_type order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee, table_name
order by table_name, grantee;

-- Revision-guarded mutable tables must have no column-level mutation bypass.
select
  grantee,
  table_name,
  column_name,
  privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in (
    'profiles',
    'user_settings',
    'notification_preferences',
    'prayers',
    'reflections',
    'user_quests',
    'reading_progress',
    'verse_bookmarks',
    'user_recent_verses'
  )
  and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE')
order by table_name, column_name;

-- 6. Internal triggers assign server revisions, expose old-client daily-quest
-- writes to CAS revisions, and bind all synced writes to retained generation.
select
  trigger.tgname as trigger_name,
  trigger.tgenabled as enabled,
  pg_catalog.pg_get_triggerdef(trigger.oid, true) as definition
from pg_catalog.pg_trigger as trigger
join pg_catalog.pg_class as table_class
  on table_class.oid = trigger.tgrelid
join pg_catalog.pg_namespace as table_namespace
  on table_namespace.oid = table_class.relnamespace
where table_namespace.nspname = 'public'
  and table_class.relname in (
    'profiles',
    'user_settings',
    'notification_preferences',
    'user_recent_verses',
    'user_daily_quests',
    'user_daily_quest_days',
    'user_quests',
    'quest_completions',
    'prayers',
    'reflections',
    'journey_events',
    'growth_events',
    'user_milestones',
    'verse_bookmarks',
    'reading_progress',
    'chapters_read'
  )
  and not trigger.tgisinternal
order by table_class.relname, trigger.tgname;

select
  procedure.proname as function_name,
  procedure.prosecdef as security_definer,
  procedure.proconfig as function_settings,
  pg_catalog.has_function_privilege(
    'anon', procedure.oid, 'EXECUTE'
  ) as anon_can_execute,
  pg_catalog.has_function_privilege(
    'authenticated', procedure.oid, 'EXECUTE'
  ) as authenticated_can_execute
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'keep_newest_recent_verse',
    'advance_account_sync_revision',
    'bump_daily_quest_revision_for_legacy_write',
    'preserve_daily_quest_completion_for_legacy_write'
  )
  and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
order by procedure.proname;

-- 7. Revision and retained generation state exposes only opaque concurrency
-- values to authenticated clients; raw request history stays hidden.
select
  grantee,
  table_name,
  column_name,
  privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('user_daily_quest_days', 'user_sync_state')
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, column_name, privilege_type;

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'user_settings',
    'notification_preferences',
    'prayers',
    'reflections',
    'user_quests',
    'reading_progress',
    'verse_bookmarks',
    'user_recent_verses'
  )
  and column_name = 'sync_revision'
order by table_name;

-- 8. Public readiness surfaces return only fixed identities and booleans
-- derived from the live RLS, grant, RPC, trigger, and update-boundary posture.
select public.daily_quest_sync_contract() as daily_quest_sync_contract;
select public.mutable_account_sync_contract() as mutable_account_sync_contract;
select public.account_sync_contract() as account_sync_contract;

-- 9. Unbound security-definer entry points remain absent after 0019.
select
  pg_catalog.to_regprocedure(
    'public.replace_user_daily_quests(date,bigint,uuid,jsonb)'
  ) is null as old_daily_replace_absent,
  pg_catalog.to_regprocedure(
    'public.upsert_mutable_account_rows(text,jsonb)'
  ) is null as old_mutable_write_absent,
  pg_catalog.to_regprocedure(
    'public.purge_user_data()'
  ) is null as old_purge_absent;
