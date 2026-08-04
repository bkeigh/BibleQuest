begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select is(
  public.arcade_store_contract(),
  '{"contract":"biblequest_arcade_store_v1","ok":true}'::jsonb,
  'the sealed arcade store contract is ready'
);
select has_table('public', 'arcade_orders', 'durable arcade orders exist');
select has_table(
  'public',
  'arcade_question_skip_redemptions',
  'idempotent Question Skip redemptions exist'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.arcade_orders'::regclass),
  'arcade orders enable RLS'
);
select ok(
  (select relforcerowsecurity from pg_catalog.pg_class where oid = 'public.arcade_orders'::regclass),
  'arcade orders force RLS'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.arcade_question_skip_redemptions'::regclass),
  'skip redemptions enable RLS'
);
select ok(
  (select relforcerowsecurity from pg_catalog.pg_class where oid = 'public.arcade_question_skip_redemptions'::regclass),
  'skip redemptions force RLS'
);
select ok(
  not has_table_privilege('anon', 'public.arcade_orders', 'SELECT'),
  'anonymous clients cannot read purchases'
);
select ok(
  not has_table_privilege('authenticated', 'public.arcade_orders', 'SELECT'),
  'authenticated clients cannot read provider purchase rows'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_arcade_question_skip(uuid,text)',
    'EXECUTE'
  ),
  'browser clients cannot consume Question Skips directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_arcade_question_skip(uuid,text)',
    'EXECUTE'
  ),
  'the server service role can consume Question Skips'
);

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  'd6000000-0000-4000-8000-000000000006',
  'arcade@example.com',
  '{}'::jsonb,
  now(),
  now()
);

set local role service_role;

insert into public.arcade_orders (
  user_id,
  product_key,
  stripe_checkout_session_id,
  stripe_payment_intent_id,
  stripe_customer_id,
  stripe_price_id,
  stripe_product_id,
  livemode,
  currency,
  amount_total,
  outcome_status,
  last_stripe_event_created,
  last_stripe_event_id
) values (
  'd6000000-0000-4000-8000-000000000006',
  'question-skip',
  'cs_test_ArcadeSkip123',
  'pi_ArcadeSkip123',
  'cus_Arcade123',
  'price_ArcadeSkip123',
  'prod_ArcadeSkip123',
  false,
  'usd',
  99,
  'completed',
  1784916100,
  'evt_ArcadeSkip123'
);

create temporary table arcade_skip_results (
  name text primary key,
  response jsonb not null
) on commit drop;

insert into arcade_skip_results values (
  'first',
  public.consume_arcade_question_skip(
    'd6000000-0000-4000-8000-000000000006',
    'day-1'
  )
);

select is(
  (select response->>'consumed' from arcade_skip_results where name = 'first'),
  'true',
  'an owned Question Skip is consumed'
);
select is(
  (select response->>'remaining' from arcade_skip_results where name = 'first'),
  '0',
  'the remaining count reaches zero'
);
select is(
  (select units_consumed from public.arcade_orders),
  1,
  'the order records one consumed unit'
);
select is(
  (select count(*) from public.arcade_question_skip_redemptions),
  1::bigint,
  'one chapter redemption is recorded'
);

insert into arcade_skip_results values (
  'retry',
  public.consume_arcade_question_skip(
    'd6000000-0000-4000-8000-000000000006',
    'day-1'
  )
);

select is(
  (select response->>'already_consumed' from arcade_skip_results where name = 'retry'),
  'true',
  'a same-chapter retry is idempotent'
);
select is(
  (select units_consumed from public.arcade_orders),
  1,
  'a retry does not consume another unit'
);
select is(
  (
    public.consume_arcade_question_skip(
      'd6000000-0000-4000-8000-000000000006',
      'day-2'
    )->>'consumed'
  ),
  'false',
  'another chapter cannot consume an unavailable unit'
);

select * from finish();
rollback;
