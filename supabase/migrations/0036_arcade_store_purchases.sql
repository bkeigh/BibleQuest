-- Projects Stripe arcade purchases into durable, server-owned entitlements.

create table public.arcade_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text not null unique,
  stripe_customer_id text not null,
  stripe_price_id text not null,
  stripe_product_id text not null,
  livemode boolean not null,
  currency text not null,
  amount_total integer not null,
  amount_refunded integer not null default 0,
  units_total integer not null default 1,
  units_consumed integer not null default 0,
  outcome_status text not null default 'completed',
  last_stripe_event_created bigint not null,
  last_stripe_event_id text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint arcade_orders_product_check check (
    product_key in ('question-skip', 'game-pass')
  ),
  constraint arcade_orders_session_check check (
    stripe_checkout_session_id ~ '^cs_(test_|live_)?[A-Za-z0-9]+$'
  ),
  constraint arcade_orders_intent_check check (
    stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'
  ),
  constraint arcade_orders_customer_check check (
    stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'
  ),
  constraint arcade_orders_price_check check (
    stripe_price_id ~ '^price_[A-Za-z0-9]+$'
  ),
  constraint arcade_orders_product_id_check check (
    stripe_product_id ~ '^prod_[A-Za-z0-9]+$'
  ),
  constraint arcade_orders_money_check check (
    currency = 'usd'
    and amount_total in (99, 299)
    and amount_refunded between 0 and amount_total
  ),
  constraint arcade_orders_product_amount_check check (
    (product_key = 'question-skip' and amount_total = 99)
    or (product_key = 'game-pass' and amount_total = 299)
  ),
  constraint arcade_orders_units_check check (
    units_total = 1 and units_consumed between 0 and units_total
  ),
  constraint arcade_orders_outcome_check check (
    outcome_status in (
      'completed',
      'partially_refunded',
      'refunded',
      'disputed',
      'dispute_won',
      'dispute_lost'
    )
  ),
  constraint arcade_orders_event_check check (
    last_stripe_event_created > 0
    and last_stripe_event_id ~ '^evt_[A-Za-z0-9]+$'
  )
);

create index arcade_orders_user_product_idx
  on public.arcade_orders (user_id, product_key, created_at);

-- Records an idempotent chapter redemption for each purchased Question Skip.
create table public.arcade_question_skip_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.arcade_orders(id) on delete restrict,
  chapter_id text not null,
  redeemed_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint arcade_skip_chapter_check check (
    chapter_id ~ '^day-[1-7]$'
  ),
  unique (user_id, chapter_id)
);

alter table public.arcade_orders enable row level security;
alter table public.arcade_orders force row level security;
alter table public.arcade_question_skip_redemptions enable row level security;
alter table public.arcade_question_skip_redemptions force row level security;

revoke all on table public.arcade_orders from public, anon, authenticated;
revoke all on table public.arcade_question_skip_redemptions
  from public, anon, authenticated;
grant all on table public.arcade_orders to service_role;
grant all on table public.arcade_question_skip_redemptions to service_role;

-- Consumes one skip atomically and makes retries for the same chapter free.
create or replace function public.consume_arcade_question_skip(
  p_user_id uuid,
  p_chapter_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  selected_order public.arcade_orders%rowtype;
  remaining integer;
begin
  if p_user_id is null
     or p_chapter_id !~ '^day-[1-7]$'
     or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'arcade skip: invalid request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  if exists (
    select 1
    from public.arcade_question_skip_redemptions
    where user_id = p_user_id and chapter_id = p_chapter_id
  ) then
    select coalesce(sum(units_total - units_consumed), 0)::integer
    into remaining
    from public.arcade_orders
    where user_id = p_user_id
      and product_key = 'question-skip'
      and outcome_status in ('completed', 'partially_refunded', 'dispute_won');
    return pg_catalog.jsonb_build_object(
      'consumed', true,
      'already_consumed', true,
      'remaining', remaining
    );
  end if;

  select *
  into selected_order
  from public.arcade_orders
  where user_id = p_user_id
    and product_key = 'question-skip'
    and outcome_status in ('completed', 'partially_refunded', 'dispute_won')
    and units_consumed < units_total
  order by created_at, id
  for update
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object(
      'consumed', false,
      'already_consumed', false,
      'remaining', 0
    );
  end if;

  update public.arcade_orders
  set
    units_consumed = units_consumed + 1,
    updated_at = pg_catalog.clock_timestamp()
  where id = selected_order.id;

  insert into public.arcade_question_skip_redemptions (
    user_id,
    order_id,
    chapter_id
  ) values (
    p_user_id,
    selected_order.id,
    p_chapter_id
  );

  select coalesce(sum(units_total - units_consumed), 0)::integer
  into remaining
  from public.arcade_orders
  where user_id = p_user_id
    and product_key = 'question-skip'
    and outcome_status in ('completed', 'partially_refunded', 'dispute_won');

  return pg_catalog.jsonb_build_object(
    'consumed', true,
    'already_consumed', false,
    'remaining', remaining
  );
end;
$function$;

-- Exposes only a fixed readiness identity, never purchase rows or provider IDs.
create or replace function public.arcade_store_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'contract', 'biblequest_arcade_store_v1'
  );
$function$;

alter function public.consume_arcade_question_skip(uuid, text)
  owner to postgres;
alter function public.arcade_store_contract() owner to postgres;

revoke all on function public.consume_arcade_question_skip(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_arcade_question_skip(uuid, text)
  to service_role;

revoke all on function public.arcade_store_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.arcade_store_contract()
  to anon, authenticated, service_role;
