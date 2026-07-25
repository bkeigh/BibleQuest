-- One-time Plus lives in the sealed billing projection beside subscriptions.
-- Provider identifiers and financial state remain service-role only.
alter table public.subscriptions
  add column if not exists livemode boolean,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists amount_total bigint,
  add column if not exists amount_refunded bigint not null default 0,
  add column if not exists outcome_status text,
  add column if not exists dispute_status text;

alter table public.subscriptions
  drop constraint if exists subscriptions_interval_check;
alter table public.subscriptions
  drop constraint if exists subscriptions_stripe_shape_check;

alter table public.subscriptions
  add constraint subscriptions_interval_check check (
    billing_interval is null
    or billing_interval in ('monthly', 'annual', 'lifetime', 'unknown')
  ),
  add constraint subscriptions_lifetime_amount_check check (
    amount_total is null
    or (
      amount_total > 0
      and amount_refunded between 0 and amount_total
    )
  ),
  add constraint subscriptions_lifetime_session_check check (
    stripe_checkout_session_id is null
    or stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$'
  ),
  add constraint subscriptions_lifetime_intent_check check (
    stripe_payment_intent_id is null
    or stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'
  ),
  add constraint subscriptions_lifetime_outcome_check check (
    outcome_status is null
    or outcome_status in (
      'completed',
      'partially_refunded',
      'refunded',
      'disputed',
      'dispute_won',
      'dispute_lost'
    )
  ),
  add constraint subscriptions_lifetime_dispute_check check (
    dispute_status is null
    or pg_catalog.length(dispute_status) between 1 and 64
  ),
  add constraint subscriptions_stripe_shape_check check (
    provider <> 'stripe'
    or (
      external_customer_id ~ '^cus_[A-Za-z0-9]+$'
      and stripe_price_id ~ '^price_[A-Za-z0-9]+$'
      and stripe_product_id ~ '^prod_[A-Za-z0-9]+$'
      and billing_interval is not null
      and currency is not null
      and synchronized_at is not null
      and (
        (
          billing_interval = 'lifetime'
          and external_subscription_id is null
          and livemode is not null
          and stripe_checkout_session_id is not null
          and stripe_payment_intent_id is not null
          and amount_total is not null
          and outcome_status is not null
          and (
            (
              livemode
              and stripe_checkout_session_id ~ '^cs_live_[A-Za-z0-9]+$'
            )
            or (
              not livemode
              and stripe_checkout_session_id ~ '^cs_test_[A-Za-z0-9]+$'
            )
          )
        )
        or (
          billing_interval <> 'lifetime'
          and external_subscription_id ~ '^sub_[A-Za-z0-9]+$'
          and stripe_checkout_session_id is null
          and stripe_payment_intent_id is null
          and amount_total is null
          and outcome_status is null
        )
      )
    )
  );

alter table public.subscriptions
  add constraint subscriptions_checkout_session_key
  unique (stripe_checkout_session_id);
create unique index subscriptions_payment_intent_idx
  on public.subscriptions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Browser roles retain the same sanitized projection; new provider and money
-- columns are deliberately omitted from the existing authenticated grant.
revoke select (
  livemode,
  stripe_checkout_session_id,
  stripe_payment_intent_id,
  amount_total,
  amount_refunded,
  outcome_status,
  dispute_status
) on public.subscriptions from authenticated;
grant all on table public.subscriptions to service_role;

-- Readiness repeats the complete billing boundary and proves lifetime columns
-- remain sealed before any route can create Checkout.
create or replace function public.stripe_billing_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with expected_tables(table_name) as (
  values
    ('subscriptions'),
    ('stripe_customers'),
    ('stripe_webhook_events'),
    ('stripe_action_claims'),
    ('stripe_billing_signals')
), table_posture as (
  select
    pg_catalog.count(*) = 5
    and pg_catalog.bool_and(class.relrowsecurity) as ok
  from expected_tables
  join pg_catalog.pg_namespace as namespace
    on namespace.nspname = 'public'
  join pg_catalog.pg_class as class
    on class.relnamespace = namespace.oid
    and class.relname = expected_tables.table_name
    and class.relkind = 'r'
), policy_posture as (
  select
    pg_catalog.count(*) = 1
    and pg_catalog.bool_and(
      policy.tablename = 'subscriptions'
      and policy.policyname = 'own subscription: select'
      and policy.roles = array['authenticated']::name[]
      and policy.cmd = 'SELECT'
      and policy.qual like '%auth.uid%'
      and policy.with_check is null
    ) as ok
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename in (
      'subscriptions',
      'stripe_customers',
      'stripe_webhook_events',
      'stripe_action_claims',
      'stripe_billing_signals'
    )
), sealed_mutations as (
  select pg_catalog.count(*) = 0 as ok
  from expected_tables
  where pg_catalog.has_table_privilege(
    'authenticated',
    'public.' || expected_tables.table_name,
    'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'
  )
), service_table_access as (
  select pg_catalog.count(*) = 5 as ok
  from expected_tables
  where pg_catalog.has_table_privilege(
    'service_role',
    'public.' || expected_tables.table_name,
    'SELECT,INSERT,UPDATE,DELETE'
  )
), sealed_identifiers as (
  select
    not pg_catalog.has_column_privilege(
      'authenticated',
      'public.subscriptions',
      'external_customer_id',
      'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated',
      'public.subscriptions',
      'external_subscription_id',
      'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated',
      'public.subscriptions',
      'stripe_price_id',
      'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated',
      'public.subscriptions',
      'stripe_checkout_session_id',
      'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated',
      'public.subscriptions',
      'stripe_payment_intent_id',
      'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated',
      'public.subscriptions',
      'amount_total',
      'SELECT'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.stripe_customers',
      'SELECT'
    ) as ok
), expected_functions(signature) as (
  values
    ('public.claim_stripe_webhook_event(text,text,bigint,boolean)'),
    ('public.complete_stripe_webhook_event(text,uuid,text,text)'),
    ('public.claim_stripe_action(uuid,text,integer)')
), function_posture as (
  select
    pg_catalog.count(*) = 3
    and pg_catalog.bool_and(
      procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
      and pg_catalog.has_function_privilege(
        'service_role', procedure.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated', procedure.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon', procedure.oid, 'EXECUTE'
      )
    ) as ok
  from expected_functions
  join pg_catalog.pg_proc as procedure
    on procedure.oid = pg_catalog.to_regprocedure(
      expected_functions.signature
    )
)
select pg_catalog.jsonb_build_object(
  'contract',
  'biblequest_stripe_test_billing_v2',
  'ok',
    coalesce((select ok from table_posture), false)
    and coalesce((select ok from policy_posture), false)
    and coalesce((select ok from sealed_mutations), false)
    and coalesce((select ok from service_table_access), false)
    and coalesce((select ok from sealed_identifiers), false)
    and coalesce((select ok from function_posture), false)
);
$function$;

alter function public.stripe_billing_contract() owner to postgres;
revoke all on function public.stripe_billing_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.stripe_billing_contract()
  to anon, authenticated, service_role;
