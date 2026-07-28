begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

select is(
  public.operator_plus_grant_contract(),
  '{"contract":"biblequest_operator_plus_grant_v1","ok":true}'::jsonb,
  'the sealed operator Plus contract is ready'
);
select has_table(
  'public',
  'operator_plus_grants',
  'manual Plus grant history exists'
);
select ok(
  (
    select class.relrowsecurity
    from pg_catalog.pg_class as class
    where class.oid = 'public.operator_plus_grants'::regclass
  ),
  'manual Plus grant history enforces RLS'
);
select ok(
  (
    select class.relforcerowsecurity
    from pg_catalog.pg_class as class
    where class.oid = 'public.operator_plus_grants'::regclass
  ),
  'manual Plus grant history forces RLS'
);
select is(
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'operator_plus_grants'
  ),
  0::bigint,
  'manual Plus grant history has no browser policy'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.operator_plus_grants',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'anonymous clients cannot read or mutate manual grants'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.operator_plus_grants',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated clients cannot read or mutate manual grants'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.operator_plus_grants',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'public.operator_plus_grants',
    'INSERT,UPDATE,DELETE'
  ),
  'service code reads grants but must mutate through RPCs'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.grant_operator_plus(uuid,text,text,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.revoke_operator_plus(uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'the service role owns both entitlement mutations'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.grant_operator_plus(uuid,text,text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.revoke_operator_plus(uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'browser roles cannot mutate manual entitlements'
);

insert into auth.users (
  id,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    'operator@example.com',
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'member@example.com',
    '{}'::jsonb,
    now(),
    now()
  );

set local role service_role;

create temporary table operator_plus_results (
  name text primary key,
  response jsonb not null
) on commit drop;

insert into operator_plus_results
values (
  'first',
  public.grant_operator_plus(
    'd2000000-0000-4000-8000-000000000002',
    '30d',
    'Approved QA access.',
    'd1000000-0000-4000-8000-000000000001',
    'operator@example.com'
  )
);

select is(
  (select response->>'ok' from operator_plus_results where name = 'first'),
  'true',
  'an operator can grant bounded Plus access'
);
select is(
  (
    select duration_key
    from public.operator_plus_grants
    where user_id = 'd2000000-0000-4000-8000-000000000002'
      and revoked_at is null
  ),
  '30d',
  'the active grant stores its bounded duration'
);
select ok(
  (
    select expires_at between
      starts_at + interval '29 days 23 hours'
      and starts_at + interval '30 days 1 hour'
    from public.operator_plus_grants
    where user_id = 'd2000000-0000-4000-8000-000000000002'
      and revoked_at is null
  ),
  'the database computes rather than trusts the client expiry'
);
select is(
  (
    select pg_catalog.count(*)
    from public.console_audit_logs
    where action = 'entitlement.plus_grant'
      and target_key = 'd2000000-0000-4000-8000-000000000002'
      and outcome = 'succeeded'
  ),
  1::bigint,
  'grant success is recorded atomically'
);

insert into operator_plus_results
values (
  'replacement',
  public.grant_operator_plus(
    'd2000000-0000-4000-8000-000000000002',
    'lifetime',
    'Founder-approved permanent access.',
    'd1000000-0000-4000-8000-000000000001',
    'operator@example.com'
  )
);

select is(
  (
    select response->>'duration'
    from operator_plus_results
    where name = 'replacement'
  ),
  'lifetime',
  'an operator can replace a grant with lifetime access'
);
select is(
  (
    select pg_catalog.count(*)
    from public.operator_plus_grants
    where user_id = 'd2000000-0000-4000-8000-000000000002'
      and revoked_at is null
  ),
  1::bigint,
  'only one unsuperseded grant exists per account'
);
select is(
  (
    select pg_catalog.count(*)
    from public.operator_plus_grants
    where user_id = 'd2000000-0000-4000-8000-000000000002'
  ),
  2::bigint,
  'replacement retains the prior grant history'
);
select is(
  (
    select revocation_reason
    from public.operator_plus_grants
    where user_id = 'd2000000-0000-4000-8000-000000000002'
      and duration_key = '30d'
  ),
  'Superseded by a new operator grant.',
  'replacement explains why the prior grant closed'
);

insert into public.subscriptions (
  user_id,
  provider,
  status,
  plan_key,
  current_period_start,
  current_period_end,
  external_customer_id,
  external_subscription_id,
  stripe_price_id,
  stripe_product_id,
  billing_interval,
  currency,
  synchronized_at
)
values (
  'd2000000-0000-4000-8000-000000000002',
  'stripe',
  'active',
  'plus',
  now(),
  now() + interval '1 month',
  'cus_OperatorGrantTest001',
  'sub_OperatorGrantTest001',
  'price_OperatorGrantTest001',
  'prod_OperatorGrantTest001',
  'monthly',
  'usd',
  now()
);

insert into operator_plus_results
values (
  'revoke',
  public.revoke_operator_plus(
    'd2000000-0000-4000-8000-000000000002',
    'QA access window completed.',
    'd1000000-0000-4000-8000-000000000001',
    'operator@example.com'
  )
);

select is(
  (select response->>'ok' from operator_plus_results where name = 'revoke'),
  'true',
  'an operator can revoke manual Plus access'
);
select is(
  (
    select pg_catalog.count(*)
    from public.operator_plus_grants
    where user_id = 'd2000000-0000-4000-8000-000000000002'
      and revoked_at is null
  ),
  0::bigint,
  'revocation closes the manual grant'
);
select is(
  (
    select revocation_reason
    from public.operator_plus_grants
    where user_id = 'd2000000-0000-4000-8000-000000000002'
      and duration_key = 'lifetime'
  ),
  'QA access window completed.',
  'revocation stores the explicit reason'
);
select is(
  (
    select pg_catalog.count(*)
    from public.console_audit_logs
    where action = 'entitlement.plus_revoke'
      and target_key = 'd2000000-0000-4000-8000-000000000002'
      and outcome = 'succeeded'
  ),
  1::bigint,
  'revoke success is recorded atomically'
);
select is(
  (
    select status || ':' || plan_key
    from public.subscriptions
    where user_id = 'd2000000-0000-4000-8000-000000000002'
  ),
  'active:plus',
  'manual revocation never changes a Stripe entitlement'
);
select throws_ok(
  $$select public.grant_operator_plus(
    'd2000000-0000-4000-8000-000000000002',
    'custom',
    'Invalid duration.',
    'd1000000-0000-4000-8000-000000000001',
    'operator@example.com'
  )$$,
  '22023',
  null,
  'unbounded durations are rejected'
);
select throws_ok(
  $$select public.grant_operator_plus(
    'd2000000-0000-4000-8000-000000000002',
    '7d',
    'x',
    'd1000000-0000-4000-8000-000000000001',
    'operator@example.com'
  )$$,
  '22023',
  null,
  'short reasons are rejected'
);
select throws_ok(
  $$select public.grant_operator_plus(
    'd2000000-0000-4000-8000-000000000002',
    '7d',
    'Mismatched operator test.',
    'd1000000-0000-4000-8000-000000000001',
    'attacker@example.com'
  )$$,
  '22023',
  null,
  'the database binds the operator ID to the operator email'
);
select throws_ok(
  $$select public.revoke_operator_plus(
    'd2000000-0000-4000-8000-000000000002',
    'Duplicate revoke test.',
    'd1000000-0000-4000-8000-000000000001',
    'operator@example.com'
  )$$,
  '22023',
  null,
  'a duplicate revoke cannot fabricate an audit success'
);

select * from finish();
rollback;
