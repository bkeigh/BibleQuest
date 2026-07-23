begin;

-- Linked CLI tests enter through a restricted login; use the database owner.
set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

-- Pin the public, content-free readiness gate.
select is(
  (public.account_deletion_contract()->>'ready')::boolean,
  true,
  'the generation-bound account deletion contract is ready'
);
select ok(
  has_function_privilege(
    'anon',
    'public.account_deletion_contract()',
    'EXECUTE'
  ),
  'anonymous readiness checks may inspect only the bounded contract'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.account_deletion_contract()',
    'EXECUTE'
  ),
  'authenticated clients cannot use the release-only contract'
);

-- Create real-shaped identities with nonzero generations and owned rows.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('b1000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('b2000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

set local role service_role;
insert into public.prayers (
  id, user_id, body, category, status, created_at, updated_at
) values
  (
    'b1100000-0000-4000-8000-000000000011',
    'b1000000-0000-4000-8000-000000000001',
    'generation-bound owner prayer',
    'general',
    'active',
    now(),
    now()
  ),
  (
    'b2200000-0000-4000-8000-000000000022',
    'b2000000-0000-4000-8000-000000000002',
    'other owner prayer',
    'general',
    'active',
    now(),
    now()
  );
reset role;
set role postgres;

-- Move the owner beyond the cached-client compatibility generation.
update public.user_sync_state
set generation = 7
where user_id = 'b1000000-0000-4000-8000-000000000001';

-- Invoke the exact browser RPC posture without custom sync headers.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000001',
  true
);
select lives_ok(
  $$select public.delete_own_account()$$,
  'a nonzero-generation account deletes without browser sync headers'
);
reset role;
set role postgres;

select is(
  (
    select count(*)
    from auth.users
    where id = 'b1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'the current Auth identity is removed'
);
select is(
  (
    select count(*)
    from public.user_sync_state
    where user_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'the retained sync state cascades with the identity'
);
select is(
  (
    select count(*)
    from public.prayers
    where user_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'owned rows are purged before the Auth identity'
);
select is(
  (
    select count(*)
    from auth.users
    where id = 'b2000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'another Auth identity remains'
);
select is(
  (
    select count(*)
    from public.prayers
    where user_id = 'b2000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'another account journey remains isolated'
);

select * from finish();
rollback;
