-- Sanitized staging-only evidence for migration 0037.
-- Run after the shared RLS report against the reviewed account-beta project.
-- It reads only catalogs and the one public boolean feature-flag row.

-- The public probe must expose only its fixed contract and current boolean.
select public.native_account_beta_availability()
  as native_account_beta_availability;

select key, description, enabled
from public.feature_flags
where key = 'native_account_beta';

-- All three availability functions must retain their exact API-role posture.
with expected (function_name) as (
  values
    ('native_account_beta_availability'),
    ('native_account_beta_request_allowed'),
    ('enforce_native_account_beta_availability')
)
select
  expected.function_name,
  procedure.oid is not null as function_exists,
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
  ) as service_role_can_execute
from expected
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = 'public'
left join pg_catalog.pg_proc as procedure
  on procedure.pronamespace = namespace.oid
 and procedure.proname = expected.function_name
 and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
order by expected.function_name;

-- The avatar-deletion latch is content-free in this report: inspect only its
-- RLS posture, constraints, grants, and the two serialized API boundaries.
select
  class.relname as table_name,
  class.relrowsecurity as rowsecurity,
  class.relforcerowsecurity as force_rowsecurity,
  constraint_record.conname,
  constraint_record.contype,
  constraint_record.confdeltype
from pg_catalog.pg_class as class
join pg_catalog.pg_namespace as namespace
  on namespace.oid = class.relnamespace
left join pg_catalog.pg_constraint as constraint_record
  on constraint_record.conrelid = class.oid
where namespace.nspname = 'public'
  and class.relname = 'account_deletion_latches'
order by constraint_record.conname;

select
  procedure.proname as function_name,
  procedure.prosecdef as security_definer,
  procedure.provolatile as volatility,
  procedure.proconfig as function_settings,
  pg_catalog.has_function_privilege(
    'anon', procedure.oid, 'EXECUTE'
  ) as anon_can_execute,
  pg_catalog.has_function_privilege(
    'authenticated', procedure.oid, 'EXECUTE'
  ) as authenticated_can_execute,
  pg_catalog.has_function_privilege(
    'service_role', procedure.oid, 'EXECUTE'
  ) as service_role_can_execute
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'avatar_upload_allowed',
    'begin_own_account_deletion'
  )
order by procedure.proname;

-- Every synchronized relation needs the restrictive read/write policy and
-- the trigger that also protects security-definer mutation paths.
with expected (table_name) as (
  values
    ('profiles'),
    ('user_settings'),
    ('notification_preferences'),
    ('user_daily_quest_days'),
    ('user_daily_quests'),
    ('user_quests'),
    ('quest_completions'),
    ('prayers'),
    ('reflections'),
    ('verse_bookmarks'),
    ('reading_progress'),
    ('chapters_read'),
    ('user_recent_verses'),
    ('user_guided_movements'),
    ('journey_events'),
    ('growth_events'),
    ('user_milestones'),
    ('user_sync_state')
)
select
  expected.table_name,
  policy.policyname,
  policy.permissive,
  policy.roles,
  policy.cmd,
  policy.qual as using_expression,
  policy.with_check as with_check_expression,
  trigger.tgname as trigger_name,
  trigger.tgenabled as trigger_enabled,
  pg_catalog.pg_get_triggerdef(trigger.oid, true) as trigger_definition
from expected
left join pg_catalog.pg_policies as policy
  on policy.schemaname = 'public'
 and policy.tablename = expected.table_name
 and policy.policyname = 'native account beta availability'
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = 'public'
left join pg_catalog.pg_class as table_class
  on table_class.relnamespace = namespace.oid
 and table_class.relname = expected.table_name
left join pg_catalog.pg_trigger as trigger
  on trigger.tgrelid = table_class.oid
 and trigger.tgname = 'enforce_native_account_beta_availability'
 and not trigger.tgisinternal
order by expected.table_name;
