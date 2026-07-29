begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.subscriptions'::regclass
      and conname = 'subscriptions_external_subscription_key'
      and contype = 'u'
  ),
  'subscription identifiers use a full unique constraint'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'subscriptions_external_subscription_idx'
  ),
  'the incompatible partial unique index is removed'
);

set local role service_role;

select lives_ok(
  $$insert into public.subscriptions (
      provider,
      status,
      plan_key,
      external_customer_id,
      external_subscription_id,
      stripe_price_id,
      stripe_product_id,
      livemode,
      billing_interval,
      currency,
      synchronized_at
    ) values (
      'stripe',
      'active',
      'plus',
      'cus_TestConflict031',
      'sub_TestConflict031',
      'price_TestConflict031',
      'prod_TestPlus031',
      false,
      'monthly',
      'usd',
      now()
    )
    on conflict (external_subscription_id) do update
    set status = excluded.status,
        plan_key = excluded.plan_key,
        updated_at = now();

    insert into public.subscriptions (
      provider,
      status,
      plan_key,
      external_customer_id,
      external_subscription_id,
      stripe_price_id,
      stripe_product_id,
      livemode,
      billing_interval,
      currency,
      synchronized_at
    ) values (
      'stripe',
      'canceled',
      'free',
      'cus_TestConflict031',
      'sub_TestConflict031',
      'price_TestConflict031',
      'prod_TestPlus031',
      false,
      'monthly',
      'usd',
      now()
    )
    on conflict (external_subscription_id) do update
    set status = excluded.status,
        plan_key = excluded.plan_key,
        updated_at = now()$$,
  'the exact Stripe upsert conflict target is accepted'
);

select is(
  (
    select pg_catalog.count(*)::text || ':' || max(status)
    from public.subscriptions
    where external_subscription_id = 'sub_TestConflict031'
  ),
  '1:canceled',
  'a repeated subscription event updates one row'
);

select * from finish();
rollback;
