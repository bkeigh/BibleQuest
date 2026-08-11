-- Serializes each final Stripe rehydrate/write pair by canonical provider ID.
create table public.stripe_projection_leases (
  projection_key text primary key,
  claim_token uuid not null,
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint stripe_projection_key_check check (
    pg_catalog.length(projection_key) between 8 and 128
    and projection_key ~
      '^(subscription:sub_[A-Za-z0-9]+|lifetime:pi_[A-Za-z0-9]+)$'
  )
);

alter table public.stripe_projection_leases enable row level security;
revoke all on table public.stripe_projection_leases
  from anon, authenticated;
grant all on table public.stripe_projection_leases to service_role;

-- Claims one short lease and permits recovery after a bounded stale window.
create or replace function public.claim_stripe_projection(
  p_projection_key text,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  token uuid := gen_random_uuid();
  claimed public.stripe_projection_leases%rowtype;
begin
  if p_projection_key is null
     or pg_catalog.length(p_projection_key) not between 8 and 128
     or p_projection_key !~
       '^(subscription:sub_[A-Za-z0-9]+|lifetime:pi_[A-Za-z0-9]+)$'
     or p_lease_seconds not between 30 and 600 then
    raise exception 'stripe projection: invalid claim'
      using errcode = '22023';
  end if;

  insert into public.stripe_projection_leases (
    projection_key,
    claim_token,
    claimed_at
  ) values (
    p_projection_key,
    token,
    pg_catalog.clock_timestamp()
  )
  on conflict (projection_key) do update
  set
    claim_token = excluded.claim_token,
    claimed_at = excluded.claimed_at
  where stripe_projection_leases.claimed_at <=
    pg_catalog.clock_timestamp()
      - pg_catalog.make_interval(secs => p_lease_seconds)
  returning * into claimed;

  if not found then
    return pg_catalog.jsonb_build_object('claimed', false);
  end if;
  return pg_catalog.jsonb_build_object(
    'claimed', true,
    'claim_token', claimed.claim_token
  );
end;
$function$;

-- Releases only the active token so an expired worker cannot clear a new lease.
create or replace function public.release_stripe_projection(
  p_projection_key text,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_projection_key is null
     or pg_catalog.length(p_projection_key) not between 8 and 128
     or p_projection_key !~
       '^(subscription:sub_[A-Za-z0-9]+|lifetime:pi_[A-Za-z0-9]+)$'
     or p_claim_token is null then
    raise exception 'stripe projection: invalid release'
      using errcode = '22023';
  end if;

  delete from public.stripe_projection_leases
  where projection_key = p_projection_key
    and claim_token = p_claim_token;
  return found;
end;
$function$;

alter function public.claim_stripe_projection(text, integer)
  owner to postgres;
alter function public.release_stripe_projection(text, uuid)
  owner to postgres;
revoke all on function public.claim_stripe_projection(text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.release_stripe_projection(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_projection(text, integer)
  to service_role;
grant execute on function public.release_stripe_projection(text, uuid)
  to service_role;

-- Retryable provider/database outages never turn into a terminal event state.
alter table public.stripe_webhook_events
  drop constraint stripe_webhook_attempt_check;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_attempt_check check (
    attempt_count between 1 and 2147483647
  );

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event public.stripe_webhook_events%rowtype;
  token uuid := gen_random_uuid();
begin
  if p_event_id !~ '^evt_[A-Za-z0-9]+$'
     or pg_catalog.length(p_event_type) not between 3 and 96
     or p_event_type !~ '^[a-z_]+(?:\.[a-z_]+)+$'
     or p_event_created <= 0
     or p_livemode is null then
    raise exception 'stripe webhook: invalid claim'
      using errcode = '22023';
  end if;

  loop
    select *
    into event
    from public.stripe_webhook_events
    where event_id = p_event_id
    for update;

    if not found then
      begin
        insert into public.stripe_webhook_events (
          event_id,
          event_type,
          event_created,
          livemode,
          claim_token
        ) values (
          p_event_id,
          p_event_type,
          p_event_created,
          p_livemode,
          token
        )
        returning * into event;
        exit;
      exception
        when unique_violation then
          -- A concurrent receiver won; inspect its row on the next pass.
      end;
    elsif event.event_type <> p_event_type
          or event.event_created <> p_event_created
          or event.livemode <> p_livemode then
      raise exception 'stripe webhook: immutable identity mismatch'
        using errcode = '22023';
    elsif event.status = 'processed' then
      return pg_catalog.jsonb_build_object(
        'claimed', false,
        'status', 'processed'
      );
    elsif event.status = 'processing'
          and event.claimed_at >
            pg_catalog.clock_timestamp() - interval '10 minutes' then
      return pg_catalog.jsonb_build_object(
        'claimed', false,
        'status', 'processing'
      );
    else
      update public.stripe_webhook_events
      set
        status = 'processing',
        attempt_count = case
          when attempt_count = 2147483647 then 2147483647
          else attempt_count + 1
        end,
        claim_token = token,
        claimed_at = pg_catalog.clock_timestamp(),
        processed_at = null,
        error_category = null,
        updated_at = pg_catalog.clock_timestamp()
      where event_id = p_event_id
      returning * into event;
      exit;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'claimed', true,
    'claim_token', event.claim_token,
    'attempt', event.attempt_count
  );
end;
$function$;

alter function public.claim_stripe_webhook_event(
  text,
  text,
  bigint,
  boolean
) owner to postgres;
revoke all on function public.claim_stripe_webhook_event(
  text,
  text,
  bigint,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_webhook_event(
  text,
  text,
  bigint,
  boolean
) to service_role;

-- Locks and verifies the lease token in the same transaction as the write.
create or replace function public.commit_stripe_projection(
  p_projection_key text,
  p_claim_token uuid,
  p_projection jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  projection public.subscriptions%rowtype;
  written_id uuid;
begin
  if p_projection_key is null
     or p_claim_token is null
     or p_projection is null
     or pg_catalog.jsonb_typeof(p_projection) <> 'object'
     or pg_catalog.pg_column_size(p_projection) > 16384 then
    raise exception 'stripe projection: invalid commit'
      using errcode = '22023';
  end if;

  perform 1
  from public.stripe_projection_leases
  where projection_key = p_projection_key
    and claim_token = p_claim_token
  for update;
  if not found then
    return 'lease_unavailable';
  end if;

  projection := pg_catalog.jsonb_populate_record(
    null::public.subscriptions,
    p_projection
  );
  if projection.provider is distinct from 'stripe'
     or projection.livemode is null
     or projection.synchronized_at is null
     or projection.updated_at is null then
    raise exception 'stripe projection: invalid shape'
      using errcode = '22023';
  end if;

  if p_projection_key =
       'subscription:' || coalesce(projection.external_subscription_id, '')
     and projection.billing_interval <> 'lifetime'
     and projection.stripe_payment_intent_id is null then
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
      cancel_at_period_end,
      canceled_at,
      trial_end,
      latest_invoice_id,
      last_stripe_event_created,
      last_stripe_event_id,
      synchronized_at,
      livemode,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      amount_total,
      amount_refunded,
      outcome_status,
      dispute_status,
      updated_at
    ) values (
      projection.user_id,
      projection.provider,
      projection.status,
      projection.plan_key,
      projection.current_period_start,
      projection.current_period_end,
      projection.external_customer_id,
      projection.external_subscription_id,
      projection.stripe_price_id,
      projection.stripe_product_id,
      projection.billing_interval,
      projection.currency,
      projection.cancel_at_period_end,
      projection.canceled_at,
      projection.trial_end,
      projection.latest_invoice_id,
      projection.last_stripe_event_created,
      projection.last_stripe_event_id,
      projection.synchronized_at,
      projection.livemode,
      null,
      null,
      null,
      0,
      null,
      null,
      projection.updated_at
    )
    on conflict (external_subscription_id) do update
    set
      status = excluded.status,
      plan_key = excluded.plan_key,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      stripe_price_id = excluded.stripe_price_id,
      stripe_product_id = excluded.stripe_product_id,
      billing_interval = excluded.billing_interval,
      currency = excluded.currency,
      cancel_at_period_end = excluded.cancel_at_period_end,
      canceled_at = excluded.canceled_at,
      trial_end = excluded.trial_end,
      latest_invoice_id = excluded.latest_invoice_id,
      last_stripe_event_created = excluded.last_stripe_event_created,
      last_stripe_event_id = excluded.last_stripe_event_id,
      synchronized_at = excluded.synchronized_at,
      updated_at = excluded.updated_at
    where subscriptions.user_id is not distinct from excluded.user_id
      and subscriptions.provider = 'stripe'
      and subscriptions.external_customer_id = excluded.external_customer_id
      and subscriptions.livemode = excluded.livemode
    returning id into written_id;
  elsif p_projection_key =
          'lifetime:' || coalesce(projection.stripe_payment_intent_id, '')
        and projection.billing_interval = 'lifetime'
        and projection.external_subscription_id is null
        and projection.id is not null then
    update public.subscriptions
    set
      status = projection.status,
      plan_key = projection.plan_key,
      amount_refunded = projection.amount_refunded,
      outcome_status = projection.outcome_status,
      dispute_status = projection.dispute_status,
      canceled_at = projection.canceled_at,
      last_stripe_event_created = projection.last_stripe_event_created,
      last_stripe_event_id = projection.last_stripe_event_id,
      synchronized_at = projection.synchronized_at,
      updated_at = projection.updated_at
    where id = projection.id
      and user_id is not distinct from projection.user_id
      and provider = 'stripe'
      and billing_interval = 'lifetime'
      and external_subscription_id is null
      and external_customer_id = projection.external_customer_id
      and stripe_checkout_session_id = projection.stripe_checkout_session_id
      and stripe_payment_intent_id = projection.stripe_payment_intent_id
      and amount_total = projection.amount_total
      and currency = projection.currency
      and livemode = projection.livemode
    returning id into written_id;
  elsif p_projection_key =
          'lifetime:' || coalesce(projection.stripe_payment_intent_id, '')
        and projection.billing_interval = 'lifetime'
        and projection.external_subscription_id is null
        and projection.id is null then
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
      cancel_at_period_end,
      canceled_at,
      trial_end,
      latest_invoice_id,
      last_stripe_event_created,
      last_stripe_event_id,
      synchronized_at,
      livemode,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      amount_total,
      amount_refunded,
      outcome_status,
      dispute_status,
      updated_at
    ) values (
      projection.user_id,
      projection.provider,
      projection.status,
      projection.plan_key,
      projection.current_period_start,
      projection.current_period_end,
      projection.external_customer_id,
      null,
      projection.stripe_price_id,
      projection.stripe_product_id,
      projection.billing_interval,
      projection.currency,
      projection.cancel_at_period_end,
      projection.canceled_at,
      projection.trial_end,
      null,
      projection.last_stripe_event_created,
      projection.last_stripe_event_id,
      projection.synchronized_at,
      projection.livemode,
      projection.stripe_checkout_session_id,
      projection.stripe_payment_intent_id,
      projection.amount_total,
      projection.amount_refunded,
      projection.outcome_status,
      projection.dispute_status,
      projection.updated_at
    )
    on conflict (stripe_payment_intent_id)
      where stripe_payment_intent_id is not null do update
    set
      status = excluded.status,
      plan_key = excluded.plan_key,
      amount_refunded = excluded.amount_refunded,
      outcome_status = excluded.outcome_status,
      dispute_status = excluded.dispute_status,
      canceled_at = excluded.canceled_at,
      last_stripe_event_created = excluded.last_stripe_event_created,
      last_stripe_event_id = excluded.last_stripe_event_id,
      synchronized_at = excluded.synchronized_at,
      updated_at = excluded.updated_at
    where subscriptions.user_id is not distinct from excluded.user_id
      and subscriptions.provider = 'stripe'
      and subscriptions.billing_interval = 'lifetime'
      and subscriptions.external_subscription_id is null
      and subscriptions.external_customer_id = excluded.external_customer_id
      and subscriptions.stripe_checkout_session_id =
        excluded.stripe_checkout_session_id
      and subscriptions.stripe_price_id = excluded.stripe_price_id
      and subscriptions.stripe_product_id = excluded.stripe_product_id
      and subscriptions.amount_total = excluded.amount_total
      and subscriptions.currency = excluded.currency
      and subscriptions.livemode = excluded.livemode
    returning id into written_id;
  else
    raise exception 'stripe projection: key mismatch'
      using errcode = '22023';
  end if;

  if written_id is null then
    return 'identity_mismatch';
  end if;
  return 'committed';
end;
$function$;

alter function public.commit_stripe_projection(text, uuid, jsonb)
  owner to postgres;
revoke all on function public.commit_stripe_projection(text, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.commit_stripe_projection(text, uuid, jsonb)
  to service_role;

-- V3 proves the projection lease and the two post-V2 Stripe corrections.
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
    ('stripe_billing_signals'),
    ('stripe_projection_leases')
), table_posture as (
  select
    pg_catalog.count(*) = 6
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
      'stripe_billing_signals',
      'stripe_projection_leases'
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
  select pg_catalog.count(*) = 6 as ok
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
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.stripe_projection_leases',
      'SELECT'
    ) as ok
), expected_functions(signature) as (
  values
    ('public.claim_stripe_webhook_event(text,text,bigint,boolean)'),
    ('public.complete_stripe_webhook_event(text,uuid,text,text)'),
    ('public.claim_stripe_action(uuid,text,integer)'),
    ('public.claim_stripe_projection(text,integer)'),
    ('public.release_stripe_projection(text,uuid)'),
    ('public.commit_stripe_projection(text,uuid,jsonb)')
), function_posture as (
  select
    pg_catalog.count(*) = 6
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
), correction_posture as (
  select
    pg_catalog.bool_and(checks.ok) as ok
  from (
    values
      (exists (
        select 1
        from pg_catalog.pg_constraint as constraint_record
        join pg_catalog.pg_class as class
          on class.oid = constraint_record.conrelid
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname = 'subscriptions'
          and constraint_record.conname =
            'subscriptions_external_subscription_key'
          and constraint_record.contype = 'u'
          and pg_catalog.pg_get_constraintdef(constraint_record.oid) =
            'UNIQUE (external_subscription_id)'
      )),
      (exists (
        select 1
        from pg_catalog.pg_constraint as constraint_record
        join pg_catalog.pg_class as class
          on class.oid = constraint_record.conrelid
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname = 'stripe_billing_signals'
          and constraint_record.conname = 'stripe_signal_object_check'
          and pg_catalog.strpos(
            pg_catalog.pg_get_constraintdef(constraint_record.oid),
            '^(in|re|du)_[A-Za-z0-9]+$'
          ) > 0
      )),
      (exists (
        select 1
        from pg_catalog.pg_constraint as constraint_record
        join pg_catalog.pg_class as class
          on class.oid = constraint_record.conrelid
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname = 'stripe_webhook_events'
          and constraint_record.conname = 'stripe_webhook_attempt_check'
          and pg_catalog.strpos(
            pg_catalog.pg_get_constraintdef(constraint_record.oid),
            '2147483647'
          ) > 0
      ))
  ) as checks(ok)
)
select pg_catalog.jsonb_build_object(
  'contract',
  'biblequest_stripe_test_billing_v3',
  'ok',
    coalesce((select ok from table_posture), false)
    and coalesce((select ok from policy_posture), false)
    and coalesce((select ok from sealed_mutations), false)
    and coalesce((select ok from service_table_access), false)
    and coalesce((select ok from sealed_identifiers), false)
    and coalesce((select ok from function_posture), false)
    and coalesce((select ok from correction_posture), false)
);
$function$;

alter function public.stripe_billing_contract() owner to postgres;
revoke all on function public.stripe_billing_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.stripe_billing_contract()
  to anon, authenticated, service_role;
