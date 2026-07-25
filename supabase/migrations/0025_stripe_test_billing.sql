-- Stripe-authoritative subscription projection and replay-safe webhook state.
-- Existing billing rows remain intact while application ownership becomes
-- nullable so account deletion can preserve required financial records.
alter table public.subscriptions
  drop constraint if exists subscriptions_pkey;
alter table public.subscriptions
  add column if not exists id uuid default gen_random_uuid();
update public.subscriptions
set id = gen_random_uuid()
where id is null;
alter table public.subscriptions
  alter column id set not null;
alter table public.subscriptions
  add constraint subscriptions_pkey primary key (id);

alter table public.subscriptions
  drop constraint if exists subscriptions_user_id_fkey;
alter table public.subscriptions
  alter column user_id drop not null;
alter table public.subscriptions
  add constraint subscriptions_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete set null;

alter table public.subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists stripe_product_id text,
  add column if not exists billing_interval text,
  add column if not exists currency text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists latest_invoice_id text,
  add column if not exists last_stripe_event_created bigint,
  add column if not exists last_stripe_event_id text,
  add column if not exists synchronized_at timestamptz;

alter table public.subscriptions
  add constraint subscriptions_provider_check check (
    provider is null or provider in ('revenuecat', 'stripe')
  ),
  add constraint subscriptions_status_check check (
    status in (
      'none',
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  ),
  add constraint subscriptions_plan_check check (
    plan_key in ('free', 'plus')
  ),
  add constraint subscriptions_interval_check check (
    billing_interval is null
    or billing_interval in ('monthly', 'annual', 'unknown')
  ),
  add constraint subscriptions_currency_check check (
    currency is null or currency ~ '^[a-z]{3}$'
  ),
  add constraint subscriptions_stripe_shape_check check (
    provider <> 'stripe'
    or (
      external_customer_id ~ '^cus_[A-Za-z0-9]+$'
      and external_subscription_id ~ '^sub_[A-Za-z0-9]+$'
      and stripe_price_id ~ '^price_[A-Za-z0-9]+$'
      and stripe_product_id ~ '^prod_[A-Za-z0-9]+$'
      and billing_interval is not null
      and currency is not null
      and synchronized_at is not null
    )
  );

create unique index subscriptions_external_subscription_idx
  on public.subscriptions (external_subscription_id)
  where external_subscription_id is not null;
create index subscriptions_user_status_idx
  on public.subscriptions (user_id, status, current_period_end desc)
  where user_id is not null;
create index subscriptions_customer_idx
  on public.subscriptions (external_customer_id)
  where external_customer_id is not null;

create table public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  stripe_customer_id text not null unique,
  livemode boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_customer_id_check check (
    stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'
  )
);
create unique index stripe_customers_user_idx
  on public.stripe_customers (user_id)
  where user_id is not null;

create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  event_created bigint not null,
  livemode boolean not null,
  status text not null default 'processing',
  attempt_count integer not null default 1,
  claim_token uuid not null,
  claimed_at timestamptz not null default now(),
  processed_at timestamptz,
  error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_event_id_check check (
    event_id ~ '^evt_[A-Za-z0-9]+$'
  ),
  constraint stripe_webhook_type_check check (
    pg_catalog.length(event_type) between 3 and 96
    and event_type ~ '^[a-z_]+(?:\.[a-z_]+)+$'
  ),
  constraint stripe_webhook_created_check check (event_created > 0),
  constraint stripe_webhook_status_check check (
    status in ('processing', 'processed', 'failed')
  ),
  constraint stripe_webhook_attempt_check check (
    attempt_count between 1 and 20
  ),
  constraint stripe_webhook_error_check check (
    error_category is null
    or error_category in (
      'ignored',
      'provider',
      'database',
      'invalid'
    )
  )
);
create index stripe_webhook_events_status_idx
  on public.stripe_webhook_events (status, claimed_at);

create table public.stripe_action_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  claim_token uuid not null,
  last_claimed_at timestamptz not null default now(),
  primary key (user_id, action),
  constraint stripe_action_check check (
    action in ('checkout', 'portal', 'refresh')
  )
);

create table public.stripe_billing_signals (
  event_id text primary key
    references public.stripe_webhook_events(event_id) on delete restrict,
  signal_kind text not null,
  stripe_object_id text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  amount bigint,
  currency text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint stripe_signal_kind_check check (
    signal_kind in (
      'invoice_paid',
      'invoice_payment_failed',
      'refund',
      'dispute'
    )
  ),
  constraint stripe_signal_object_check check (
    stripe_object_id ~ '^(in|re|dp)_[A-Za-z0-9]+$'
  ),
  constraint stripe_signal_customer_check check (
    stripe_customer_id is null
    or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'
  ),
  constraint stripe_signal_subscription_check check (
    stripe_subscription_id is null
    or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'
  ),
  constraint stripe_signal_amount_check check (
    amount is null or amount >= 0
  ),
  constraint stripe_signal_currency_check check (
    currency is null or currency ~ '^[a-z]{3}$'
  ),
  constraint stripe_signal_status_check check (
    status is null or pg_catalog.length(status) between 1 and 64
  )
);
create index stripe_billing_signals_subscription_idx
  on public.stripe_billing_signals (
    stripe_subscription_id,
    occurred_at desc
  );

-- Browser roles receive only a sanitized owner projection. Customer IDs,
-- subscription IDs, webhook state, and financial signals remain server-only.
alter table public.stripe_customers enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_action_claims enable row level security;
alter table public.stripe_billing_signals enable row level security;

drop policy if exists "own subscription: select"
  on public.subscriptions;
create policy "own subscription: select"
on public.subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.subscriptions
  from anon, authenticated;
revoke all on table public.stripe_customers
  from anon, authenticated;
revoke all on table public.stripe_webhook_events
  from anon, authenticated;
revoke all on table public.stripe_action_claims
  from anon, authenticated;
revoke all on table public.stripe_billing_signals
  from anon, authenticated;

grant all on table public.subscriptions to service_role;
grant all on table public.stripe_customers to service_role;
grant all on table public.stripe_webhook_events to service_role;
grant all on table public.stripe_action_claims to service_role;
grant all on table public.stripe_billing_signals to service_role;
grant select (
  id,
  user_id,
  provider,
  status,
  plan_key,
  current_period_start,
  current_period_end,
  billing_interval,
  currency,
  cancel_at_period_end,
  canceled_at,
  trial_end,
  synchronized_at,
  updated_at
) on public.subscriptions to authenticated;

-- Claims a webhook event once, with bounded stale/failed replay recovery.
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
    elsif event.attempt_count >= 20 then
      return pg_catalog.jsonb_build_object(
        'claimed', false,
        'status', 'exhausted'
      );
    else
      update public.stripe_webhook_events
      set
        status = 'processing',
        attempt_count = attempt_count + 1,
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

-- Completes only the active event token; replayed old workers cannot win.
create or replace function public.complete_stripe_webhook_event(
  p_event_id text,
  p_claim_token uuid,
  p_outcome text,
  p_error_category text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_outcome not in ('processed', 'failed')
     or (
       p_error_category is not null
       and p_error_category not in (
         'ignored',
         'provider',
         'database',
         'invalid'
       )
     )
     or (p_outcome = 'processed' and p_error_category not in ('ignored'))
     or (p_outcome = 'failed' and p_error_category is null) then
    raise exception 'stripe webhook: invalid completion'
      using errcode = '22023';
  end if;

  update public.stripe_webhook_events
  set
    status = p_outcome,
    processed_at = case
      when p_outcome = 'processed' then pg_catalog.clock_timestamp()
      else null
    end,
    error_category = p_error_category,
    updated_at = pg_catalog.clock_timestamp()
  where event_id = p_event_id
    and claim_token = p_claim_token
    and status = 'processing';
  return found;
end;
$function$;

-- Rate-limits server billing actions and supplies one opaque attempt token.
create or replace function public.claim_stripe_action(
  p_user_id uuid,
  p_action text,
  p_minimum_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  token uuid := gen_random_uuid();
  claimed public.stripe_action_claims%rowtype;
begin
  if p_user_id is null
     or p_action not in ('checkout', 'portal', 'refresh')
     or p_minimum_seconds not between 5 and 300
     or not exists (
       select 1 from auth.users where id = p_user_id
     ) then
    raise exception 'stripe action: invalid claim'
      using errcode = '22023';
  end if;

  insert into public.stripe_action_claims (
    user_id,
    action,
    claim_token,
    last_claimed_at
  ) values (
    p_user_id,
    p_action,
    token,
    pg_catalog.clock_timestamp()
  )
  on conflict (user_id, action) do update
  set
    claim_token = excluded.claim_token,
    last_claimed_at = excluded.last_claimed_at
  where stripe_action_claims.last_claimed_at <=
    pg_catalog.clock_timestamp()
      - pg_catalog.make_interval(secs => p_minimum_seconds)
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

alter function public.claim_stripe_webhook_event(
  text, text, bigint, boolean
) owner to postgres;
alter function public.complete_stripe_webhook_event(
  text, uuid, text, text
) owner to postgres;
alter function public.claim_stripe_action(
  uuid, text, integer
) owner to postgres;

revoke all on function public.claim_stripe_webhook_event(
  text, text, bigint, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.complete_stripe_webhook_event(
  text, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.claim_stripe_action(
  uuid, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_webhook_event(
  text, text, bigint, boolean
) to service_role;
grant execute on function public.complete_stripe_webhook_event(
  text, uuid, text, text
) to service_role;
grant execute on function public.claim_stripe_action(
  uuid, text, integer
) to service_role;

-- Fixed readiness proves the projection, sealed identifiers, RLS, grants, and
-- service-only replay/rate-limit functions used by every billing route.
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
  'biblequest_stripe_test_billing_v1',
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
