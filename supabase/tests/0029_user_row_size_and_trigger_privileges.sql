begin;

-- Linked CLI tests enter through a restricted login; use the database owner.
set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

select ok(
  (
    select not procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure(
      'public.enforce_user_owned_row_size()'
    )
  ),
  'the row-size trigger is invoker-only with an empty search path'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.enforce_user_owned_row_size()', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated', 'public.enforce_user_owned_row_size()', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role', 'public.enforce_user_owned_row_size()', 'EXECUTE'
  ),
  'API roles cannot call the row-size trigger function directly'
);

select is(
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_proc as procedure
      on procedure.oid = trigger.tgfoid
    join pg_catalog.pg_class as relation
      on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and trigger.tgname = 'enforce_user_owned_row_size'
      and not trigger.tgisinternal
      and trigger.tgenabled <> 'D'
      and procedure.proname = 'enforce_user_owned_row_size'
  ),
  16::bigint,
  'all sixteen synced resources enforce the row-size cap'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.ensure_journey_event_date_key()', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated', 'public.ensure_journey_event_date_key()', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role', 'public.ensure_journey_event_date_key()', 'EXECUTE'
  ),
  'the Journey fallback trigger is not a direct API function'
);

-- Use a real profile row and the service role to isolate the size trigger.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values (
  'a9000000-0000-4000-8000-000000000009',
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
);

set local role service_role;
select throws_ok(
  $$
    update public.profiles
    set display_name = pg_catalog.repeat('x', 1048577)
    where id = 'a9000000-0000-4000-8000-000000000009'
  $$,
  '22001',
  'account sync row exceeds 1 MiB',
  'oversized synced rows fail before storage'
);

select * from finish();
rollback;
