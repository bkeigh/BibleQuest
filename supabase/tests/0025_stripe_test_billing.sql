begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(36);

select is(
  public.stripe_billing_contract(),
  '{"contract":"biblequest_stripe_test_billing_v1","ok":true}'::jsonb,
  'the sealed Stripe billing contract is ready'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'subscriptions',
        'stripe_customers',
        'stripe_webhook_events',
        'stripe_action_claims',
        'stripe_billing_signals'
      )
      and class.relrowsecurity
  ),
  5::bigint,
  'all five billing tables enforce RLS'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'subscriptions',
        'stripe_customers',
        'stripe_webhook_events',
        'stripe_action_claims',
        'stripe_billing_signals'
      )
  ),
  1::bigint,
  'only the sanitized subscription owner-read policy exists'
);
select is(
  (
    select count(*)
    from (values
      ('subscriptions'),
      ('stripe_customers'),
      ('stripe_webhook_events'),
      ('stripe_action_claims'),
      ('stripe_billing_signals')
    ) as resource(table_name)
    where has_table_privilege(
      'authenticated',
      'public.' || resource.table_name,
      'INSERT,UPDATE,DELETE'
    )
  ),
  0::bigint,
  'authenticated clients cannot mutate billing state'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.subscriptions',
    'external_customer_id',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'public.subscriptions',
    'external_subscription_id',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.stripe_customers',
    'SELECT'
  ),
  'Stripe identifiers and customer mappings are sealed'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_stripe_webhook_event(text,text,bigint,boolean)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.complete_stripe_webhook_event(text,uuid,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.claim_stripe_action(uuid,text,integer)',
    'EXECUTE'
  ),
  'service role owns the atomic billing entry points'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_stripe_webhook_event(text,text,bigint,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.claim_stripe_action(uuid,text,integer)',
    'EXECUTE'
  ),
  'browser roles cannot claim webhooks or billing actions'
);

insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  (
    'c1000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'c2000000-0000-4000-8000-000000000002',
    '{}'::jsonb,
    now(),
    now()
  );

set local role service_role;
insert into public.stripe_customers (
  user_id,
  stripe_customer_id,
  livemode
) values (
  'c1000000-0000-4000-8000-000000000001',
  'cus_TestCustomer001',
  false
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
) values (
  'c1000000-0000-4000-8000-000000000001',
  'stripe',
  'active',
  'plus',
  now(),
  now() + interval '1 month',
  'cus_TestCustomer001',
  'sub_TestSubscription001',
  'price_TestMonthly001',
  'prod_TestPlus001',
  'monthly',
  'usd',
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*) from public.subscriptions),
  1::bigint,
  'the owner can read their sanitized subscription'
);
select is(
  (
    select status || ':' || plan_key || ':' || billing_interval
    from public.subscriptions
  ),
  'active:plus:monthly',
  'the owner sees bounded lifecycle and plan posture'
);
select throws_ok(
  $$select external_customer_id from public.subscriptions$$,
  '42501',
  null,
  'the owner cannot select the Stripe customer ID'
);
select set_config(
  'request.jwt.claim.sub',
  'c2000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from public.subscriptions),
  0::bigint,
  'another account cannot enumerate the owner subscription'
);

set local role service_role;
create temporary table stripe_claim_results (
  name text primary key,
  response jsonb not null
) on commit drop;
insert into stripe_claim_results values (
  'event-first',
  public.claim_stripe_webhook_event(
    'evt_TestEvent001',
    'customer.subscription.updated',
    1784916000,
    false
  )
);
select is(
  (select response->>'claimed' from stripe_claim_results where name = 'event-first'),
  'true',
  'the first webhook receiver wins its event claim'
);
select is(
  public.claim_stripe_webhook_event(
    'evt_TestEvent001',
    'customer.subscription.updated',
    1784916000,
    false
  )->>'claimed',
  'false',
  'a concurrent duplicate webhook is rejected'
);
select is(
  public.claim_stripe_webhook_event(
    'evt_TestEvent001',
    'customer.subscription.updated',
    1784916000,
    false
  )->>'status',
  'processing',
  'an in-flight duplicate is distinguished for provider retry'
);
select is(
  public.complete_stripe_webhook_event(
    'evt_TestEvent001',
    (
      select (response->>'claim_token')::uuid
      from stripe_claim_results where name = 'event-first'
    ),
    'processed',
    null
  ),
  true,
  'the active webhook token completes'
);
select is(
  (
    select status
    from public.stripe_webhook_events
    where event_id = 'evt_TestEvent001'
  ),
  'processed',
  'the event stores a content-free processed outcome'
);
select is(
  public.complete_stripe_webhook_event(
    'evt_TestEvent001',
    (
      select (response->>'claim_token')::uuid
      from stripe_claim_results where name = 'event-first'
    ),
    'processed',
    null
  ),
  false,
  'a finished event token cannot complete twice'
);
select is(
  public.claim_stripe_webhook_event(
    'evt_TestEvent001',
    'customer.subscription.updated',
    1784916000,
    false
  )->>'claimed',
  'false',
  'a processed event remains replay-safe'
);
select is(
  public.claim_stripe_webhook_event(
    'evt_TestEvent001',
    'customer.subscription.updated',
    1784916000,
    false
  )->>'status',
  'processed',
  'a completed duplicate is safe to acknowledge'
);

insert into stripe_claim_results values (
  'event-retry-one',
  public.claim_stripe_webhook_event(
    'evt_TestEvent002',
    'invoice.payment_failed',
    1784916001,
    false
  )
);
select is(
  (select response->>'claimed' from stripe_claim_results where name = 'event-retry-one'),
  'true',
  'a second event begins at attempt one'
);
select is(
  public.complete_stripe_webhook_event(
    'evt_TestEvent002',
    (
      select (response->>'claim_token')::uuid
      from stripe_claim_results where name = 'event-retry-one'
    ),
    'failed',
    'provider'
  ),
  true,
  'a bounded provider failure is recorded for replay'
);
insert into stripe_claim_results values (
  'event-retry-two',
  public.claim_stripe_webhook_event(
    'evt_TestEvent002',
    'invoice.payment_failed',
    1784916001,
    false
  )
);
select is(
  (select response->>'claimed' from stripe_claim_results where name = 'event-retry-two'),
  'true',
  'a failed receiver may retry the same immutable event'
);
select is(
  (select response->>'attempt' from stripe_claim_results where name = 'event-retry-two'),
  '2',
  'webhook replay advances a bounded attempt counter'
);
select is(
  public.complete_stripe_webhook_event(
    'evt_TestEvent002',
    (
      select (response->>'claim_token')::uuid
      from stripe_claim_results where name = 'event-retry-two'
    ),
    'processed',
    'ignored'
  ),
  true,
  'a safely ignored replay can complete explicitly'
);

select is(
  public.claim_stripe_action(
    'c1000000-0000-4000-8000-000000000001',
    'checkout',
    30
  )->>'claimed',
  'true',
  'the first checkout action is allowed'
);
select is(
  public.claim_stripe_action(
    'c1000000-0000-4000-8000-000000000001',
    'checkout',
    30
  )->>'claimed',
  'false',
  'a rapid duplicate checkout is throttled'
);
select is(
  public.claim_stripe_action(
    'c1000000-0000-4000-8000-000000000001',
    'portal',
    10
  )->>'claimed',
  'true',
  'billing actions have independent throttle lanes'
);
update public.stripe_action_claims
set last_claimed_at = now() - interval '31 seconds'
where user_id = 'c1000000-0000-4000-8000-000000000001'
  and action = 'checkout';
select is(
  public.claim_stripe_action(
    'c1000000-0000-4000-8000-000000000001',
    'checkout',
    30
  )->>'claimed',
  'true',
  'the checkout throttle reopens after its bounded window'
);

select throws_ok(
  $$insert into public.subscriptions (
      user_id,
      provider,
      status,
      plan_key
    ) values (
      'c1000000-0000-4000-8000-000000000001',
      'stripe',
      'active',
      'plus'
    )$$,
  '23514',
  null,
  'Stripe projections require complete provider identifiers'
);
select throws_ok(
  $$insert into public.subscriptions (
      user_id,
      status,
      plan_key
    ) values (
      'c1000000-0000-4000-8000-000000000001',
      'invented',
      'free'
    )$$,
  '23514',
  null,
  'unknown subscription lifecycle states are rejected'
);

insert into public.stripe_webhook_events (
  event_id,
  event_type,
  event_created,
  livemode,
  status,
  claim_token,
  processed_at
) values (
  'evt_TestEvent003',
  'invoice.paid',
  1784916002,
  false,
  'processed',
  gen_random_uuid(),
  now()
);
insert into public.stripe_billing_signals (
  event_id,
  signal_kind,
  stripe_object_id,
  stripe_customer_id,
  stripe_subscription_id,
  status,
  amount,
  currency,
  occurred_at
) values (
  'evt_TestEvent003',
  'invoice_paid',
  'in_TestInvoice001',
  'cus_TestCustomer001',
  'sub_TestSubscription001',
  'paid',
  500,
  'usd',
  now()
);
select is(
  (
    select count(*)
    from public.stripe_billing_signals
    where event_id = 'evt_TestEvent003'
  ),
  1::bigint,
  'a bounded billing signal is retained without payload or card data'
);

reset role;
set role postgres;
delete from auth.users
where id = 'c1000000-0000-4000-8000-000000000001';
select is(
  (
    select count(*)
    from public.stripe_customers
    where stripe_customer_id = 'cus_TestCustomer001'
      and user_id is null
  ),
  1::bigint,
  'account deletion detaches but preserves the Stripe customer mapping'
);
select is(
  (
    select count(*)
    from public.subscriptions
    where external_subscription_id = 'sub_TestSubscription001'
      and user_id is null
  ),
  1::bigint,
  'account deletion detaches but preserves the subscription record'
);
select is(
  (
    select count(*)
    from public.stripe_action_claims
    where user_id = 'c1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'account deletion removes non-financial action throttles'
);
select is(
  (
    select count(*)
    from public.stripe_billing_signals
    where event_id = 'evt_TestEvent003'
  ),
  1::bigint,
  'account deletion preserves bounded financial event records'
);

set local role anon;
select is(
  public.stripe_billing_contract(),
  '{"contract":"biblequest_stripe_test_billing_v1","ok":true}'::jsonb,
  'anonymous readiness remains fixed and identifier-free'
);

select * from finish();
rollback;
