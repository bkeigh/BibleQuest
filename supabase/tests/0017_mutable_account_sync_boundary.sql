begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

-- Create disposable owners; every row is removed by the surrounding rollback.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('71000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('72000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

-- Exercise the historical boundary through a transaction-local adapter while
-- 0018 pins the production four-argument signature and response generation.
create function public.upsert_mutable_account_rows(
  p_resource text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  live_generation bigint;
  response jsonb;
begin
  select generation into live_generation
  from public.user_sync_state
  where user_id = uid;
  response := public.upsert_mutable_account_rows_internal(
    p_resource,
    p_rows
  );
  return response;
end;
$function$;

revoke execute on function public.upsert_mutable_account_rows(text, jsonb)
  from public, anon;
grant execute on function public.upsert_mutable_account_rows(text, jsonb)
  to authenticated;

-- Pin the guarded RPC and bounded readiness surface.
select has_function(
  'public',
  'mutable_account_sync_contract',
  array[]::text[],
  'mutable account readiness contract exists'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_catalog.pg_proc
   where oid = 'public.mutable_account_sync_contract()'::regprocedure),
  'readiness contract is security definer with an empty search path'
);
select ok(
  has_function_privilege(
    'anon', 'public.mutable_account_sync_contract()', 'EXECUTE'
  ),
  'anonymous clients may execute the content-free readiness contract'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.mutable_account_sync_contract()', 'EXECUTE'
  ),
  'authenticated clients may execute the content-free readiness contract'
);
set local role service_role;
select is(
  (select count(*)
   from jsonb_object_keys(public.mutable_account_sync_contract())),
  2::bigint,
  'stronger inherited roles still receive only the two bounded fields'
);
reset role;
select ok(
  has_function_privilege(
    'authenticated',
    'public.upsert_mutable_account_rows(text,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients retain guarded RPC execution'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.upsert_mutable_account_rows(text,jsonb)',
    'EXECUTE'
  ),
  'anonymous clients retain no guarded write execution'
);

-- Exact API grants remove UPDATE only from the five guarded tables.
select is(
  (select string_agg(privilege_type, ',' order by privilege_type)
   from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'profiles'
     and grantee = 'authenticated'),
  'SELECT',
  'profiles retain exactly authenticated SELECT'
);
select is(
  (select count(*)
   from (
     select table_name
     from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in (
         'user_settings',
         'notification_preferences',
         'prayers',
         'reflections'
       )
       and grantee = 'authenticated'
     group by table_name
     having string_agg(privilege_type, ',' order by privilege_type)
       = 'SELECT'
   ) as exact_grants),
  4::bigint,
  'guarded tables retain exactly SELECT'
);
select is(
  (select count(*)
   from (
     select table_name
     from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in (
         'profiles',
         'user_settings',
         'notification_preferences',
         'prayers',
         'reflections'
       )
       and grantee = 'service_role'
     group by table_name
     having string_agg(privilege_type, ',' order by privilege_type)
       = 'DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'
   ) as service_updates),
  5::bigint,
  'service_role retains all privileges on all five guarded tables'
);
select is(
  (select count(*)
   from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in (
       'profiles',
       'user_settings',
       'notification_preferences',
       'prayers',
       'reflections'
     )
     and grantee = 'anon'),
  0::bigint,
  'anonymous clients retain no guarded-table grants'
);
select is(
  (select count(*)
   from information_schema.column_privileges
   where table_schema = 'public'
     and table_name in (
       'profiles',
       'user_settings',
       'notification_preferences',
       'prayers',
       'reflections'
     )
     and grantee = 'authenticated'
     and privilege_type = 'UPDATE'),
  0::bigint,
  'authenticated clients retain no column-level UPDATE bypass'
);

-- The anonymous contract returns only a fixed identity and live boolean.
set local role anon;
select is(
  public.mutable_account_sync_contract(),
  '{"contract":"biblequest_mutable_account_sync_v2","ok":true}'::jsonb,
  'readiness reports the live v2 boundary'
);
select is(
  (select count(*)
   from jsonb_object_keys(public.mutable_account_sync_contract())),
  2::bigint,
  'readiness returns exactly two bounded fields'
);
reset role;

-- Build canonical rows through the guarded RPC as the first owner.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000001',
  true
);
create temporary table mutable_boundary_results (
  name text primary key,
  acknowledgement jsonb not null
) on commit drop;

insert into mutable_boundary_results values (
  'insert',
  public.upsert_mutable_account_rows(
    'prayers',
    '[{"id":"73000000-0000-4000-8000-000000000003","title":null,"body":"Synthetic initial prayer","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:00Z"}]'::jsonb
  )
);
select is(
  (select acknowledgement
   from mutable_boundary_results where name = 'insert'),
  '{"applied":1,"stale":0}'::jsonb,
  'guarded RPC insert remains available'
);

-- Cached direct updates and conflict-upserts fail closed on every guarded table.
select throws_ok(
  $$update public.profiles set display_name = 'Cached profile'$$,
  '42501',
  null,
  'cached direct profile UPDATE is denied'
);
select throws_ok(
  $$update public.user_settings set theme = 'light'$$,
  '42501',
  null,
  'cached direct settings UPDATE is denied'
);
select throws_ok(
  $$update public.notification_preferences set daily_verse_enabled = false$$,
  '42501',
  null,
  'cached direct notification UPDATE is denied'
);
select throws_ok(
  $$update public.prayers set body = 'Cached prayer'$$,
  '42501',
  null,
  'cached direct prayer UPDATE is denied'
);
select throws_ok(
  $$update public.reflections set body = 'Cached reflection'$$,
  '42501',
  null,
  'cached direct reflection UPDATE is denied'
);
select throws_ok(
  $$insert into public.prayers (
      id, user_id, body, category, status, created_at, updated_at
    ) values (
      '73000000-0000-4000-8000-000000000003',
      '71000000-0000-4000-8000-000000000001',
      'Cached conflict upsert',
      'general',
      'active',
      '2026-07-22T20:00:00Z',
      '2028-07-22T20:00:00Z'
    ) on conflict (id) do update set body = excluded.body$$,
  '42501',
  null,
  'cached direct conflict-upsert is denied'
);

-- RPC updates still apply newer/equal timestamps and reject stale timestamps.
insert into mutable_boundary_results values
  (
    'newer',
    public.upsert_mutable_account_rows(
      'prayers',
      '[{"id":"73000000-0000-4000-8000-000000000003","title":null,"body":"Synthetic newer prayer","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:01Z"}]'::jsonb
    )
  ),
  (
    'equal',
    public.upsert_mutable_account_rows(
      'prayers',
      '[{"id":"73000000-0000-4000-8000-000000000003","title":null,"body":"Synthetic newer prayer","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:01Z"}]'::jsonb
    )
  ),
  (
    'stale',
    public.upsert_mutable_account_rows(
      'prayers',
      '[{"id":"73000000-0000-4000-8000-000000000003","title":null,"body":"Synthetic stale prayer","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:00Z"}]'::jsonb
    )
  );
select is(
  (select acknowledgement
   from mutable_boundary_results where name = 'newer'),
  '{"applied":1,"stale":0}'::jsonb,
  'newer RPC update applies'
);
select is(
  (select acknowledgement
   from mutable_boundary_results where name = 'equal'),
  '{"applied":1,"stale":0}'::jsonb,
  'equal-timestamp RPC retry is idempotently accepted'
);
select is(
  (select acknowledgement
   from mutable_boundary_results where name = 'stale'),
  '{"applied":0,"stale":1}'::jsonb,
  'stale RPC update is rejected'
);
select is(
  (select body from public.prayers
   where id = '73000000-0000-4000-8000-000000000003'),
  'Synthetic newer prayer',
  'canonical content remains the newest RPC value'
);

-- Direct INSERT and DELETE now fail closed behind the v4 CAS boundary.
select throws_ok(
  $$insert into public.prayers (
      id, user_id, body, category, status, created_at, updated_at
    ) values (
      '74000000-0000-4000-8000-000000000004',
      '71000000-0000-4000-8000-000000000001',
      'Synthetic direct insert', 'general', 'active',
      '2026-07-22T20:00:00Z', '2027-07-22T20:00:00Z'
    )$$,
  '42501',
  null,
  'direct INSERT is denied by the v4 boundary'
);
select is(
  (select count(*) from public.prayers
   where id = '74000000-0000-4000-8000-000000000004'),
  0::bigint,
  'the denied direct INSERT leaves no owner row'
);
select throws_ok(
  $$delete from public.prayers
    where id = '74000000-0000-4000-8000-000000000004'$$,
  '42501',
  null,
  'direct DELETE is denied by the tombstone boundary'
);
select is(
  (select count(*) from public.prayers
   where id = '74000000-0000-4000-8000-000000000004'),
  0::bigint,
  'the denied direct DELETE leaves the table unchanged'
);

-- RLS isolation still hides the first owner's row from the second owner.
select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from public.prayers
   where id = '73000000-0000-4000-8000-000000000003'),
  0::bigint,
  'second owner cannot select the first owner row'
);
insert into mutable_boundary_results values (
  'cross-owner',
  public.upsert_mutable_account_rows(
    'prayers',
    '[{"id":"73000000-0000-4000-8000-000000000003","title":null,"body":"Synthetic cross-owner prayer","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2028-07-22T20:00:00Z"}]'::jsonb
  )
);
select is(
  (select acknowledgement
   from mutable_boundary_results where name = 'cross-owner'),
  '{"applied":0,"stale":1}'::jsonb,
  'second owner cannot update the first owner row through the RPC'
);

-- The original owner still observes the unchanged canonical row.
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select user_id from public.prayers
   where id = '73000000-0000-4000-8000-000000000003'),
  '71000000-0000-4000-8000-000000000001'::uuid,
  'cross-owner RPC cannot change ownership'
);
select is(
  (select body from public.prayers
   where id = '73000000-0000-4000-8000-000000000003'),
  'Synthetic newer prayer',
  'cross-owner RPC cannot change content'
);

-- Posture remains true after all denial and isolation checks.
select is(
  public.mutable_account_sync_contract(),
  '{"contract":"biblequest_mutable_account_sync_v2","ok":true}'::jsonb,
  'live readiness remains true after boundary checks'
);

reset role;
select * from finish();
rollback;
