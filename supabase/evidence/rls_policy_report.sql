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
  ) as authenticated_can_execute
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'purge_user_data',
    'replace_user_daily_quests',
    'bump_daily_quest_revision_for_legacy_write'
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

-- 6. Internal triggers preserve newest recent verses and expose old-client
-- daily-quest writes to CAS revisions. Definitions contain no application rows.
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
    'user_recent_verses',
    'user_daily_quests'
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
    'bump_daily_quest_revision_for_legacy_write'
  )
  and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
order by procedure.proname;

-- 7. The revision table intentionally exposes only the day and opaque
-- revision to authenticated clients; the raw owner column remains hidden.
select
  grantee,
  table_name,
  column_name,
  privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'user_daily_quest_days'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, column_name, privilege_type;
