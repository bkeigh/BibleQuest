begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

select is(
  public.stripe_billing_contract(),
  '{"contract":"biblequest_stripe_test_billing_v3","ok":true}'::jsonb,
  'the V3 billing contract proves leases and prior Stripe corrections'
);
select ok(
  (
    select class.relrowsecurity
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'stripe_projection_leases'
  ),
  'projection leases enforce RLS'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'stripe_projection_leases'
  ),
  0::bigint,
  'projection leases expose no browser policy'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_stripe_projection(text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.release_stripe_projection(text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.commit_stripe_projection(text,uuid,jsonb)',
    'EXECUTE'
  ),
  'the service role can claim and release projection leases'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_stripe_projection(text,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.release_stripe_projection(text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.commit_stripe_projection(text,uuid,jsonb)',
    'EXECUTE'
  ),
  'browser roles cannot operate projection leases'
);

set local role service_role;
create temporary table projection_claim_results (
  name text primary key,
  response jsonb not null
) on commit drop;
insert into projection_claim_results values (
  'first',
  public.claim_stripe_projection('subscription:sub_Test001', 120)
);
select is(
  (select response->>'claimed' from projection_claim_results where name = 'first'),
  'true',
  'the first subscription projection acquires its lease'
);
select is(
  public.claim_stripe_projection(
    'subscription:sub_Test001',
    120
  )->>'claimed',
  'false',
  'a concurrent projection cannot enter the same provider key'
);
select is(
  public.release_stripe_projection(
    'subscription:sub_Test001',
    'd2000000-0000-4000-8000-000000000002'::uuid
  ),
  false,
  'an unrelated token cannot release the active lease'
);
select is(
  public.release_stripe_projection(
    'subscription:sub_Test001',
    (
      select (response->>'claim_token')::uuid
      from projection_claim_results where name = 'first'
    )
  ),
  true,
  'the active token releases its lease'
);
insert into projection_claim_results values (
  'second',
  public.claim_stripe_projection('subscription:sub_Test001', 120)
);
select is(
  (select response->>'claimed' from projection_claim_results where name = 'second'),
  'true',
  'a released provider key can be projected again'
);

update public.stripe_projection_leases
set claimed_at = pg_catalog.clock_timestamp() - interval '121 seconds'
where projection_key = 'subscription:sub_Test001';
insert into projection_claim_results values (
  'stale-recovery',
  public.claim_stripe_projection('subscription:sub_Test001', 120)
);
select is(
  (
    select response->>'claimed'
    from projection_claim_results where name = 'stale-recovery'
  ),
  'true',
  'a bounded stale lease can be recovered'
);
select isnt(
  (
    select response->>'claim_token'
    from projection_claim_results where name = 'second'
  ),
  (
    select response->>'claim_token'
    from projection_claim_results where name = 'stale-recovery'
  ),
  'stale recovery rotates the opaque claim token'
);
select is(
  public.commit_stripe_projection(
    'subscription:sub_Test001',
    (
      select (response->>'claim_token')::uuid
      from projection_claim_results where name = 'second'
    ),
    '{}'::jsonb
  ),
  'lease_unavailable',
  'an expired worker cannot commit after stale takeover'
);
select is(
  public.commit_stripe_projection(
    'subscription:sub_Test001',
    (
      select (response->>'claim_token')::uuid
      from projection_claim_results where name = 'stale-recovery'
    ),
    pg_catalog.jsonb_build_object(
      'user_id', null,
      'provider', 'stripe',
      'status', 'active',
      'plan_key', 'free',
      'external_customer_id', 'cus_Test001',
      'external_subscription_id', 'sub_Test001',
      'stripe_price_id', 'price_Test001',
      'stripe_product_id', 'prod_Test001',
      'billing_interval', 'monthly',
      'currency', 'usd',
      'cancel_at_period_end', false,
      'livemode', false,
      'synchronized_at', '2026-08-11T12:00:00Z',
      'updated_at', '2026-08-11T12:00:00Z'
    )
  ),
  'committed',
  'the active token commits while holding the lease row lock'
);
select is(
  (
    select plan_key
    from public.subscriptions
    where external_subscription_id = 'sub_Test001'
  ),
  'free',
  'the fenced projection writes the requested fail-closed state'
);
select is(
  public.commit_stripe_projection(
    'subscription:sub_Test001',
    (
      select (response->>'claim_token')::uuid
      from projection_claim_results where name = 'second'
    ),
    '{}'::jsonb
  ),
  'lease_unavailable',
  'the old token remains fenced after the new worker commits'
);
select is(
  (
    select plan_key
    from public.subscriptions
    where external_subscription_id = 'sub_Test001'
  ),
  'free',
  'a fenced old token cannot overwrite the current projection'
);
select is(
  public.commit_stripe_projection(
    'subscription:sub_Test001',
    (
      select (response->>'claim_token')::uuid
      from projection_claim_results where name = 'stale-recovery'
    ),
    pg_catalog.jsonb_build_object(
      'user_id', null,
      'provider', 'stripe',
      'status', 'active',
      'plan_key', 'plus',
      'external_customer_id', 'cus_CrossAccount001',
      'external_subscription_id', 'sub_Test001',
      'stripe_price_id', 'price_Test001',
      'stripe_product_id', 'prod_Test001',
      'billing_interval', 'monthly',
      'currency', 'usd',
      'cancel_at_period_end', false,
      'livemode', false,
      'synchronized_at', '2026-08-11T12:00:01Z',
      'updated_at', '2026-08-11T12:00:01Z'
    )
  ),
  'identity_mismatch',
  'an active lease still cannot move a subscription across Customers'
);
select is(
  (
    select external_customer_id || ':' || plan_key
    from public.subscriptions
    where external_subscription_id = 'sub_Test001'
  ),
  'cus_Test001:free',
  'an atomic identity mismatch leaves the prior owner state unchanged'
);
insert into projection_claim_results values (
  'lifetime',
  public.claim_stripe_projection('lifetime:pi_TestFence001', 120)
);
select is(
  public.commit_stripe_projection(
    'lifetime:pi_TestFence001',
    (
      select (response->>'claim_token')::uuid
      from projection_claim_results where name = 'lifetime'
    ),
    pg_catalog.jsonb_build_object(
      'user_id', null,
      'provider', 'stripe',
      'status', 'active',
      'plan_key', 'plus',
      'external_customer_id', 'cus_TestFence001',
      'stripe_price_id', 'price_TestFence001',
      'stripe_product_id', 'prod_TestFence001',
      'billing_interval', 'lifetime',
      'currency', 'usd',
      'cancel_at_period_end', false,
      'livemode', false,
      'stripe_checkout_session_id', 'cs_test_TestFence001',
      'stripe_payment_intent_id', 'pi_TestFence001',
      'amount_total', 100,
      'amount_refunded', 0,
      'outcome_status', 'completed',
      'synchronized_at', '2026-08-11T12:00:00Z',
      'updated_at', '2026-08-11T12:00:00Z'
    )
  ),
  'committed',
  'the fenced commit inserts a matching lifetime projection'
);
select is(
  (
    select plan_key
    from public.subscriptions
    where stripe_payment_intent_id = 'pi_TestFence001'
  ),
  'plus',
  'the matching paid lifetime projection starts entitled'
);
select is(
  public.commit_stripe_projection(
    'lifetime:pi_TestFence001',
    (
      select (response->>'claim_token')::uuid
      from projection_claim_results where name = 'lifetime'
    ),
    pg_catalog.jsonb_build_object(
      'id', (
        select id
        from public.subscriptions
        where stripe_payment_intent_id = 'pi_TestFence001'
      ),
      'user_id', null,
      'provider', 'stripe',
      'status', 'canceled',
      'plan_key', 'free',
      'external_customer_id', 'cus_TestFence001',
      'billing_interval', 'lifetime',
      'currency', 'usd',
      'livemode', false,
      'stripe_checkout_session_id', 'cs_test_TestFence001',
      'stripe_payment_intent_id', 'pi_TestFence001',
      'amount_total', 100,
      'amount_refunded', 100,
      'outcome_status', 'refunded',
      'last_stripe_event_created', 1786449600,
      'last_stripe_event_id', 'evt_TestFenceRefund001',
      'synchronized_at', '2026-08-11T12:01:00Z',
      'updated_at', '2026-08-11T12:01:00Z'
    )
  ),
  'committed',
  'the same lease atomically commits a lifetime revocation'
);
select is(
  (
    select plan_key || ':' || outcome_status
    from public.subscriptions
    where stripe_payment_intent_id = 'pi_TestFence001'
  ),
  'free:refunded',
  'the fenced lifetime adjustment persists the authoritative refund'
);
select throws_ok(
  $$select public.claim_stripe_projection('customer:cus_Test001', 120)$$,
  '22023',
  null,
  'unrecognized projection key kinds are rejected'
);
select throws_ok(
  $$select public.claim_stripe_projection('lifetime:pi_Test001', 10)$$,
  '22023',
  null,
  'unbounded lease windows are rejected'
);

insert into public.stripe_webhook_events (
  event_id,
  event_type,
  event_created,
  livemode,
  status,
  attempt_count,
  claim_token,
  error_category
) values (
  'evt_RetryBeyondTwenty001',
  'customer.subscription.updated',
  1786449600,
  false,
  'failed',
  20,
  'd2000000-0000-4000-8000-000000000020'::uuid,
  'provider'
);
select is(
  public.claim_stripe_webhook_event(
    'evt_RetryBeyondTwenty001',
    'customer.subscription.updated',
    1786449600,
    false
  )->>'claimed',
  'true',
  'a recovered provider outage can reclaim attempt twenty'
);
select is(
  (
    select attempt_count
    from public.stripe_webhook_events
    where event_id = 'evt_RetryBeyondTwenty001'
  ),
  21,
  'retryable webhook attempts continue without terminal exhaustion'
);

reset role;
set role postgres;
select ok(
  not has_table_privilege(
    'authenticated',
    'public.stripe_projection_leases',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated clients cannot observe or mutate provider lease keys'
);

select * from finish();
rollback;
