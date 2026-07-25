begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select is(
  public.stripe_billing_contract(),
  '{"contract":"biblequest_stripe_test_billing_v2","ok":true}'::jsonb,
  'the sealed billing contract includes lifetime Plus'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.subscriptions',
    'stripe_checkout_session_id',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'public.subscriptions',
    'stripe_payment_intent_id',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'public.subscriptions',
    'amount_total',
    'SELECT'
  ),
  'lifetime provider and financial fields remain sealed'
);

insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values (
  'c7000000-0000-4000-8000-000000000007',
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
  'c7000000-0000-4000-8000-000000000007',
  'cus_TestLifetime007',
  false
);
insert into public.subscriptions (
  user_id,
  provider,
  status,
  plan_key,
  external_customer_id,
  stripe_price_id,
  stripe_product_id,
  billing_interval,
  currency,
  livemode,
  stripe_checkout_session_id,
  stripe_payment_intent_id,
  amount_total,
  amount_refunded,
  outcome_status,
  synchronized_at
) values (
  'c7000000-0000-4000-8000-000000000007',
  'stripe',
  'active',
  'plus',
  'cus_TestLifetime007',
  'price_TestLifetime007',
  'prod_TestPlus007',
  'lifetime',
  'usd',
  false,
  'cs_test_TestLifetime007',
  'pi_TestLifetime007',
  14499,
  0,
  'completed',
  now()
);

select is(
  (
    select status || ':' || plan_key || ':' || billing_interval
    from public.subscriptions
    where stripe_checkout_session_id = 'cs_test_TestLifetime007'
  ),
  'active:plus:lifetime',
  'a complete one-time payment stores a lifetime entitlement'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c7000000-0000-4000-8000-000000000007',
  true
);
select is(
  (
    select billing_interval
    from public.subscriptions
  ),
  'lifetime',
  'the owner sees only the safe lifetime posture'
);
select throws_ok(
  $$select stripe_payment_intent_id from public.subscriptions$$,
  '42501',
  null,
  'the owner cannot select the PaymentIntent'
);

set local role service_role;
select throws_ok(
  $$insert into public.subscriptions (
      user_id,
      provider,
      status,
      plan_key,
      external_customer_id,
      stripe_price_id,
      stripe_product_id,
      billing_interval,
      currency,
      livemode,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      amount_total,
      outcome_status,
      synchronized_at
    ) values (
      'c7000000-0000-4000-8000-000000000007',
      'stripe',
      'active',
      'plus',
      'cus_TestLifetime007',
      'price_TestLifetime008',
      'prod_TestPlus007',
      'lifetime',
      'usd',
      false,
      'cs_live_TestLifetime008',
      'pi_TestLifetime008',
      14499,
      'completed',
      now()
    )$$,
  '23514',
  null,
  'test lifetime rows reject live Checkout Sessions'
);
select throws_ok(
  $$insert into public.subscriptions (
      user_id,
      provider,
      status,
      plan_key,
      external_customer_id,
      stripe_price_id,
      stripe_product_id,
      billing_interval,
      currency,
      livemode,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      amount_total,
      outcome_status,
      synchronized_at
    ) values (
      'c7000000-0000-4000-8000-000000000007',
      'stripe',
      'active',
      'plus',
      'cus_TestLifetime007',
      'price_TestLifetime009',
      'prod_TestPlus007',
      'lifetime',
      'usd',
      false,
      'cs_test_TestLifetime009',
      'pi_TestLifetime009',
      14499,
      null,
      now()
    )$$,
  '23514',
  null,
  'lifetime rows require a bounded outcome'
);
select throws_ok(
  $$insert into public.subscriptions (
      user_id,
      provider,
      status,
      plan_key,
      external_customer_id,
      stripe_price_id,
      stripe_product_id,
      billing_interval,
      currency,
      livemode,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      amount_total,
      outcome_status,
      synchronized_at
    ) values (
      'c7000000-0000-4000-8000-000000000007',
      'stripe',
      'active',
      'plus',
      'cus_TestLifetime007',
      'price_TestLifetime010',
      'prod_TestPlus007',
      'lifetime',
      'usd',
      false,
      'cs_test_TestLifetime007',
      'pi_TestLifetime010',
      14499,
      'completed',
      now()
    )$$,
  '23505',
  null,
  'a Checkout Session can grant at most one entitlement'
);
select throws_ok(
  $$insert into public.subscriptions (
      user_id,
      provider,
      status,
      plan_key,
      external_customer_id,
      stripe_price_id,
      stripe_product_id,
      billing_interval,
      currency,
      livemode,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      amount_total,
      outcome_status,
      synchronized_at
    ) values (
      'c7000000-0000-4000-8000-000000000007',
      'stripe',
      'active',
      'plus',
      'cus_TestLifetime007',
      'price_TestLifetime011',
      'prod_TestPlus007',
      'lifetime',
      'usd',
      false,
      'cs_test_TestLifetime011',
      'pi_TestLifetime007',
      14499,
      'completed',
      now()
    )$$,
  '23505',
  null,
  'a PaymentIntent can grant at most one entitlement'
);

select * from finish();
rollback;
