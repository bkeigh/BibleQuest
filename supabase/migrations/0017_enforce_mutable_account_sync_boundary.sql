-- Cached clients may still select, insert, and delete owner rows, but updates
-- must pass through the timestamp-guarded 0016 security-definer RPC.
revoke update on table
  public.profiles,
  public.user_settings,
  public.notification_preferences,
  public.prayers,
  public.reflections
from authenticated;

-- Expose one bounded readiness bit derived from the guarded function and the
-- effective authenticated update boundary rather than a version label alone.
create or replace function public.mutable_account_sync_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with guarded_function as (
  select
    procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon', procedure.oid, 'EXECUTE'
    ) as ok
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.upsert_mutable_account_rows(text,jsonb)'
  )
), mutable_tables(table_name) as (
  values
    ('profiles'),
    ('user_settings'),
    ('notification_preferences'),
    ('prayers'),
    ('reflections')
), update_boundary as (
  select
    pg_catalog.count(*) = 5
    and pg_catalog.bool_and(
      not pg_catalog.has_table_privilege(
        'authenticated',
        pg_catalog.format('public.%I', table_name),
        'UPDATE'
      )
    )
    and not exists (
      select 1
      from information_schema.column_privileges as privilege
      where privilege.table_schema = 'public'
        and privilege.table_name in (
          'profiles',
          'user_settings',
          'notification_preferences',
          'prayers',
          'reflections'
        )
        and privilege.grantee = 'authenticated'
        and privilege.privilege_type = 'UPDATE'
    ) as ok
  from mutable_tables
)
select pg_catalog.jsonb_build_object(
  'contract', 'biblequest_mutable_account_sync_v2',
  'ok', coalesce((select ok from guarded_function), false)
    and coalesce((select ok from update_boundary), false)
);
$function$;

-- Only browser API roles receive the content-free readiness surface.
revoke execute on function public.mutable_account_sync_contract() from public;
grant execute on function public.mutable_account_sync_contract()
  to anon, authenticated;
