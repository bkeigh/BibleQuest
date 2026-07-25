-- One-time Support BibleQuest payments use server-created Stripe Checkout.
-- Guest and signed-in payments remain service-only financial records.
create table public.stripe_support_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid references auth.users(id) on delete set null,
  livemode boolean not null,
  requested_amount bigint not null,
  amount_total bigint,
  amount_refunded bigint not null default 0,
  currency text not null,
  creation_status text not null default 'creating',
  creation_error_category text,
  checkout_status text not null default 'open',
  payment_status text not null default 'unpaid',
  outcome_status text not null default 'pending',
  claim_token uuid not null,
  claimed_at timestamptz not null default now(),
  attempt_count integer not null default 1,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  dispute_status text,
  completed_at timestamptz,
  expired_at timestamptz,
  last_stripe_event_created bigint,
  last_stripe_event_id text,
  synchronized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_support_amount_check check (
    requested_amount between 300 and 50000
    and (amount_total is null or amount_total = requested_amount)
    and amount_refunded between 0 and coalesce(amount_total, requested_amount)
  ),
  constraint stripe_support_currency_check check (currency = 'usd'),
  constraint stripe_support_creation_check check (
    creation_status in ('creating', 'created', 'failed')
    and (
      creation_error_category is null
      or creation_error_category in ('provider', 'database', 'invalid')
    )
  ),
  constraint stripe_support_checkout_check check (
    checkout_status in ('open', 'complete', 'expired')
  ),
  constraint stripe_support_payment_check check (
    payment_status in ('unpaid', 'paid')
  ),
  constraint stripe_support_outcome_check check (
    outcome_status in (
      'pending',
      'completed',
      'payment_failed',
      'expired',
      'partially_refunded',
      'refunded',
      'disputed',
      'dispute_won',
      'dispute_lost'
    )
  ),
  constraint stripe_support_attempt_check check (
    attempt_count between 1 and 20
  ),
  constraint stripe_support_session_check check (
    stripe_checkout_session_id is null
    or stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$'
  ),
  constraint stripe_support_session_mode_check check (
    stripe_checkout_session_id is null
    or (
      livemode
      and stripe_checkout_session_id ~ '^cs_live_[A-Za-z0-9]+$'
    )
    or (
      not livemode
      and stripe_checkout_session_id ~ '^cs_test_[A-Za-z0-9]+$'
    )
  ),
  constraint stripe_support_intent_check check (
    stripe_payment_intent_id is null
    or stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'
  ),
  constraint stripe_support_dispute_check check (
    dispute_status is null
    or pg_catalog.length(dispute_status) between 1 and 64
  ),
  constraint stripe_support_event_check check (
    last_stripe_event_id is null
    or last_stripe_event_id ~ '^evt_[A-Za-z0-9]+$'
  )
);
create index stripe_support_user_idx
  on public.stripe_support_payments (user_id, created_at desc)
  where user_id is not null;
create unique index stripe_support_session_idx
  on public.stripe_support_payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create unique index stripe_support_intent_idx
  on public.stripe_support_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table public.stripe_support_payments enable row level security;
revoke all on table public.stripe_support_payments
  from anon, authenticated;
grant all on table public.stripe_support_payments to service_role;

-- Claims one immutable support request, distinguishing safe replay from a busy
-- or exhausted creator so callers never acknowledge incomplete work.
create or replace function public.claim_stripe_support_checkout(
  p_request_id uuid,
  p_user_id uuid,
  p_amount bigint,
  p_currency text,
  p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  payment public.stripe_support_payments%rowtype;
  token uuid := gen_random_uuid();
begin
  if p_request_id is null
     or p_amount not between 300 and 50000
     or p_currency <> 'usd'
     or p_livemode is null
     or (
       p_user_id is not null
       and not exists (select 1 from auth.users where id = p_user_id)
     ) then
    raise exception 'stripe support: invalid claim'
      using errcode = '22023';
  end if;

  loop
    select *
    into payment
    from public.stripe_support_payments
    where request_id = p_request_id
    for update;

    if not found then
      begin
        insert into public.stripe_support_payments (
          request_id,
          user_id,
          livemode,
          requested_amount,
          currency,
          claim_token
        ) values (
          p_request_id,
          p_user_id,
          p_livemode,
          p_amount,
          p_currency,
          token
        )
        returning * into payment;
        exit;
      exception
        when unique_violation then
          -- A concurrent creator won; inspect its row on the next pass.
      end;
    elsif payment.user_id is distinct from p_user_id
          or payment.requested_amount <> p_amount
          or payment.currency <> p_currency
          or payment.livemode <> p_livemode then
      raise exception 'stripe support: immutable identity mismatch'
        using errcode = '22023';
    elsif payment.creation_status = 'created' then
      return pg_catalog.jsonb_build_object(
        'claimed', false,
        'status', 'created',
        'session_id', payment.stripe_checkout_session_id
      );
    elsif payment.creation_status = 'creating'
          and payment.claimed_at >
            pg_catalog.clock_timestamp() - interval '5 minutes' then
      return pg_catalog.jsonb_build_object(
        'claimed', false,
        'status', 'processing'
      );
    elsif payment.attempt_count >= 20 then
      return pg_catalog.jsonb_build_object(
        'claimed', false,
        'status', 'exhausted'
      );
    else
      update public.stripe_support_payments
      set
        creation_status = 'creating',
        creation_error_category = null,
        claim_token = token,
        claimed_at = pg_catalog.clock_timestamp(),
        attempt_count = attempt_count + 1,
        updated_at = pg_catalog.clock_timestamp()
      where request_id = p_request_id
      returning * into payment;
      exit;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'claimed', true,
    'claim_token', payment.claim_token,
    'attempt', payment.attempt_count
  );
end;
$function$;

-- Completes only the active support creation token. A successful session keeps
-- its immutable provider mapping; failures remain retryable with the same ID.
create or replace function public.complete_stripe_support_checkout(
  p_request_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_session_id text default null,
  p_error_category text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_outcome not in ('created', 'failed')
     or (
       p_outcome = 'created'
       and (
         p_session_id is null
         or p_session_id !~ '^cs_(test|live)_[A-Za-z0-9]+$'
         or p_error_category is not null
       )
     )
     or (
       p_outcome = 'failed'
       and (
         p_session_id is not null
         or p_error_category not in ('provider', 'database', 'invalid')
       )
     ) then
    raise exception 'stripe support: invalid completion'
      using errcode = '22023';
  end if;

  update public.stripe_support_payments
  set
    creation_status = p_outcome,
    creation_error_category = p_error_category,
    stripe_checkout_session_id = case
      when p_outcome = 'created' then p_session_id
      else stripe_checkout_session_id
    end,
    updated_at = pg_catalog.clock_timestamp()
  where request_id = p_request_id
    and claim_token = p_claim_token
    and creation_status = 'creating';
  return found;
end;
$function$;

alter function public.claim_stripe_support_checkout(
  uuid, uuid, bigint, text, boolean
) owner to postgres;
alter function public.complete_stripe_support_checkout(
  uuid, uuid, text, text, text
) owner to postgres;
revoke all on function public.claim_stripe_support_checkout(
  uuid, uuid, bigint, text, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.complete_stripe_support_checkout(
  uuid, uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_support_checkout(
  uuid, uuid, bigint, text, boolean
) to service_role;
grant execute on function public.complete_stripe_support_checkout(
  uuid, uuid, text, text, text
) to service_role;

-- Fixed readiness proves a policy-free service table and service-only atomic
-- creation functions without exposing amounts or provider identifiers.
create or replace function public.stripe_support_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with expected_functions(signature) as (
  values
    ('public.claim_stripe_support_checkout(uuid,uuid,bigint,text,boolean)'),
    ('public.complete_stripe_support_checkout(uuid,uuid,text,text,text)')
), function_posture as (
  select
    pg_catalog.count(*) = 2
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
  'biblequest_stripe_one_time_support_v1',
  'ok',
    exists (
      select 1
      from pg_catalog.pg_class as class
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = class.relnamespace
      where namespace.nspname = 'public'
        and class.relname = 'stripe_support_payments'
        and class.relkind = 'r'
        and class.relrowsecurity
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.stripe_support_payments',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'
    )
    and not pg_catalog.has_table_privilege(
      'anon',
      'public.stripe_support_payments',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    and pg_catalog.has_table_privilege(
      'service_role',
      'public.stripe_support_payments',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    and not exists (
      select 1
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'stripe_support_payments'
    )
    and coalesce((select ok from function_posture), false)
);
$function$;

alter function public.stripe_support_contract() owner to postgres;
revoke all on function public.stripe_support_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.stripe_support_contract()
  to anon, authenticated, service_role;
