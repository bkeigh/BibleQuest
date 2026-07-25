begin;

-- Linked CLI tests enter through a restricted login; use the database owner.
set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select is(
  public.account_deletion_contract(),
  jsonb_build_object(
    'contract', 'generation_bound_account_deletion_v2',
    'ready', true
  ),
  'the resilient account deletion contract is ready'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.delete_own_account()',
    'EXECUTE'
  ),
  'authenticated users may invoke their sealed deletion RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.delete_own_account()',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke account deletion'
);

-- Create a real-shaped owner, then simulate a missing retained sync row.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values (
  'c1000000-0000-4000-8000-000000000001',
  '{}'::jsonb,
  now(),
  now()
);

set local role service_role;
insert into public.prayers (
  id, user_id, body, category, status, created_at, updated_at
) values (
  'c1100000-0000-4000-8000-000000000011',
  'c1000000-0000-4000-8000-000000000001',
  'repair-path owner prayer',
  'general',
  'active',
  now(),
  now()
);
reset role;
set role postgres;

delete from public.user_sync_state
where user_id = 'c1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);
select lives_ok(
  $$select public.delete_own_account()$$,
  'deletion repairs missing sync state and completes'
);
reset role;
set role postgres;

select is(
  (
    select count(*)
    from auth.users
    where id = 'c1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'the repair-path Auth identity is removed'
);
select is(
  (
    select count(*)
    from public.prayers
    where user_id = 'c1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'the repair-path account rows are removed'
);
select is(
  (
    select count(*)
    from public.user_sync_state
    where user_id = 'c1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'the repaired sync state cascades with the identity'
);

set local role anon;
select throws_ok(
  $$select public.delete_own_account()$$,
  '42501',
  null,
  'anonymous deletion remains rejected'
);
reset role;
set role postgres;

select * from finish();
rollback;
