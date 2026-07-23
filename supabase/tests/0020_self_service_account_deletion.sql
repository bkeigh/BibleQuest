begin;

-- Linked CLI tests enter through a restricted login; use the database owner.
set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

-- Pin the zero-argument, security-definer boundary and browser grants.
select ok(
  to_regprocedure('public.delete_own_account()') is not null,
  'the self-service account deletion function exists'
);
select is(
  (select pronargs from pg_catalog.pg_proc
   where oid = 'public.delete_own_account()'::regprocedure),
  0::smallint,
  'account deletion accepts no caller-controlled user id'
);
select is(
  (select prorettype from pg_catalog.pg_proc
   where oid = 'public.delete_own_account()'::regprocedure),
  'void'::regtype::oid,
  'account deletion returns no identity or account data'
);
select ok(
  (select prosecdef from pg_catalog.pg_proc
   where oid = 'public.delete_own_account()'::regprocedure),
  'account deletion is security definer'
);
select is(
  (select proconfig from pg_catalog.pg_proc
   where oid = 'public.delete_own_account()'::regprocedure),
  array['search_path=""']::text[],
  'account deletion uses an empty search path'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.delete_own_account()', 'EXECUTE'
  ),
  'authenticated users may delete their own account'
);
select ok(
  not has_function_privilege(
    'anon', 'public.delete_own_account()', 'EXECUTE'
  ),
  'anonymous clients cannot invoke account deletion'
);
select ok(
  not has_function_privilege(
    'service_role', 'public.delete_own_account()', 'EXECUTE'
  ),
  'the browser-facing service role cannot invoke account deletion'
);

set local role anon;
select throws_ok(
  $$select public.delete_own_account()$$,
  '42501',
  null,
  'an anonymous invocation is rejected'
);
reset role;
set role postgres;

-- Create two identities and owner rows so deletion proves exact isolation.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('a1000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('a2000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

set local role service_role;
insert into public.prayers (
  id, user_id, body, category, status, created_at, updated_at
) values
  (
    'a1100000-0000-4000-8000-000000000011',
    'a1000000-0000-4000-8000-000000000001',
    'owner prayer', 'general', 'active', now(), now()
  ),
  (
    'a2200000-0000-4000-8000-000000000022',
    'a2000000-0000-4000-8000-000000000002',
    'other prayer', 'general', 'active', now(), now()
  );
reset role;
set role postgres;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select lives_ok(
  $$select public.delete_own_account()$$,
  'an authenticated user may delete their own identity'
);
reset role;
set role postgres;

select is(
  (select count(*) from auth.users
   where id = 'a1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the current auth identity is deleted'
);
select is(
  (select count(*) from auth.users
   where id = 'a2000000-0000-4000-8000-000000000002'),
  1::bigint,
  'the other auth identity remains'
);
select is(
  (select count(*) from public.profiles
   where id = 'a1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the current profile is removed by cascade'
);
select is(
  (select count(*) from public.profiles
   where id = 'a2000000-0000-4000-8000-000000000002'),
  1::bigint,
  'the other profile remains'
);
select is(
  (select count(*) from public.prayers
   where user_id = 'a1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the current account rows are removed by cascade'
);
select is(
  (select count(*) from public.prayers
   where user_id = 'a2000000-0000-4000-8000-000000000002'),
  1::bigint,
  'the other account rows remain isolated'
);

select * from finish();
rollback;
