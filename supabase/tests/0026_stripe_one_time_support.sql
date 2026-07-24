begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

select is(
  public.stripe_support_contract(),
  '{"contract":"biblequest_stripe_one_time_support_v1","ok":true}'::jsonb,
  'the sealed one-time support contract is ready'
);
select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.stripe_support_payments'::regclass
  ),
  'the support payment table enforces RLS'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'stripe_support_payments'
  ),
  0::bigint,
  'no browser row policy exposes financial records'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.stripe_support_payments',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'anon',
    'public.stripe_support_payments',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'browser roles have no support table privileges'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_stripe_support_checkout(uuid,uuid,bigint,text,boolean)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.complete_stripe_support_checkout(uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'service role owns the two atomic creation functions'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_stripe_support_checkout(uuid,uuid,bigint,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_stripe_support_checkout(uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'browser roles cannot claim or complete support Checkout'
);

set local role service_role;
create temporary table support_claim_results (
  name text primary key,
  response jsonb not null
) on commit drop;
insert into support_claim_results values (
  'guest-first',
  public.claim_stripe_support_checkout(
    'd1000000-0000-4000-8000-000000000001',
    null,
    1000,
    'usd',
    false
  )
);
select is(
  (select response->>'claimed' from support_claim_results where name = 'guest-first'),
  'true',
  'a guest can claim one bounded support request'
);
select is(
  public.claim_stripe_support_checkout(
    'd1000000-0000-4000-8000-000000000001',
    null,
    1000,
    'usd',
    false
  )->>'status',
  'processing',
  'a concurrent guest retry remains provider-retryable'
);
select throws_ok(
  $$select public.claim_stripe_support_checkout(
      'd1000000-0000-4000-8000-000000000001',
      null,
      2500,
      'usd',
      false
    )$$,
  '22023',
  null,
  'a reused request ID cannot manipulate the amount'
);
select is(
  public.complete_stripe_support_checkout(
    'd1000000-0000-4000-8000-000000000001',
    (
      select (response->>'claim_token')::uuid
      from support_claim_results where name = 'guest-first'
    ),
    'created',
    'cs_test_SupportSession001',
    null
  ),
  true,
  'the active guest token stores its Checkout Session'
);
select is(
  (
    select creation_status || ':' || requested_amount || ':' || currency
    from public.stripe_support_payments
    where request_id = 'd1000000-0000-4000-8000-000000000001'
  ),
  'created:1000:usd',
  'the created record retains only its bounded request shape'
);
select is(
  public.claim_stripe_support_checkout(
    'd1000000-0000-4000-8000-000000000001',
    null,
    1000,
    'usd',
    false
  )->>'status',
  'created',
  'a finished creation is replay-safe'
);
select is(
  public.complete_stripe_support_checkout(
    'd1000000-0000-4000-8000-000000000001',
    gen_random_uuid(),
    'created',
    'cs_test_SupportSession001',
    null
  ),
  false,
  'a stale token cannot overwrite a finished creation'
);

insert into support_claim_results values (
  'guest-failed',
  public.claim_stripe_support_checkout(
    'd2000000-0000-4000-8000-000000000002',
    null,
    500,
    'usd',
    false
  )
);
select is(
  public.complete_stripe_support_checkout(
    'd2000000-0000-4000-8000-000000000002',
    (
      select (response->>'claim_token')::uuid
      from support_claim_results where name = 'guest-failed'
    ),
    'failed',
    null,
    'provider'
  ),
  true,
  'a bounded provider failure is recorded'
);
insert into support_claim_results values (
  'guest-retry',
  public.claim_stripe_support_checkout(
    'd2000000-0000-4000-8000-000000000002',
    null,
    500,
    'usd',
    false
  )
);
select is(
  (select response->>'claimed' from support_claim_results where name = 'guest-retry'),
  'true',
  'a failed creation may retry idempotently'
);
select is(
  (select response->>'attempt' from support_claim_results where name = 'guest-retry'),
  '2',
  'the retry advances its bounded attempt counter'
);
select is(
  (
    select creation_error_category
    from public.stripe_support_payments
    where request_id = 'd2000000-0000-4000-8000-000000000002'
  ),
  null,
  'a retry clears the old failure category'
);
select throws_ok(
  $$update public.stripe_support_payments
    set stripe_checkout_session_id = 'cs_test_SupportSession001'
    where request_id = 'd2000000-0000-4000-8000-000000000002'$$,
  '23505',
  null,
  'one Stripe Checkout Session cannot map to two support requests'
);

select throws_ok(
  $$select public.claim_stripe_support_checkout(
      'd3000000-0000-4000-8000-000000000003',
      null,
      299,
      'usd',
      false
    )$$,
  '22023',
  null,
  'an amount below the server minimum is rejected'
);
select throws_ok(
  $$select public.claim_stripe_support_checkout(
      'd3000000-0000-4000-8000-000000000003',
      null,
      1000,
      'eur',
      false
    )$$,
  '22023',
  null,
  'a manipulated currency is rejected'
);
select throws_ok(
  $$update public.stripe_support_payments
    set amount_total = 999
    where request_id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'Stripe totals must equal the server-requested amount'
);
select throws_ok(
  $$update public.stripe_support_payments
    set amount_total = 1000, amount_refunded = 1001
    where request_id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'refund totals cannot exceed the completed payment'
);
select throws_ok(
  $$update public.stripe_support_payments
    set stripe_checkout_session_id = 'cs_hostile'
    where request_id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'malformed Checkout Session identifiers are rejected'
);
select throws_ok(
  $$update public.stripe_support_payments
    set payment_status = 'no_payment_required'
    where request_id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'a positive support amount cannot become a free payment'
);
select throws_ok(
  $$update public.stripe_support_payments
    set stripe_checkout_session_id = 'cs_live_WrongMode001'
    where request_id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'a test payment cannot retain a live Checkout Session'
);

reset role;
set role postgres;
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values (
  'd4000000-0000-4000-8000-000000000004',
  '{}'::jsonb,
  now(),
  now()
);
set local role service_role;
insert into support_claim_results values (
  'account-first',
  public.claim_stripe_support_checkout(
    'd5000000-0000-4000-8000-000000000005',
    'd4000000-0000-4000-8000-000000000004',
    2500,
    'usd',
    false
  )
);
select is(
  (select response->>'claimed' from support_claim_results where name = 'account-first'),
  'true',
  'a verified account may own its optional support record'
);

reset role;
set role postgres;
delete from auth.users
where id = 'd4000000-0000-4000-8000-000000000004';
select is(
  (
    select count(*)
    from public.stripe_support_payments
    where request_id = 'd5000000-0000-4000-8000-000000000005'
      and user_id is null
  ),
  1::bigint,
  'account deletion detaches but preserves the financial record'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd4000000-0000-4000-8000-000000000004',
  true
);
select throws_ok(
  $$select * from public.stripe_support_payments$$,
  '42501',
  null,
  'authenticated clients cannot read support payments'
);
set local role anon;
select throws_ok(
  $$select * from public.stripe_support_payments$$,
  '42501',
  null,
  'anonymous clients cannot read support payments'
);
select is(
  public.stripe_support_contract(),
  '{"contract":"biblequest_stripe_one_time_support_v1","ok":true}'::jsonb,
  'anonymous readiness remains fixed and financial-data-free'
);

reset role;
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stripe_support_payments'
      and column_name in (
        'card_number',
        'card_last4',
        'customer_email',
        'customer_name',
        'webhook_payload'
      )
  ),
  0::bigint,
  'the schema has no card, donor contact, or webhook payload columns'
);

select * from finish();
rollback;
