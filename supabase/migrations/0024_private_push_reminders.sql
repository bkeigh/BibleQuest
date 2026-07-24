-- Privacy-safe Web Push preferences, encrypted subscriptions, and bounded
-- delivery metrics. Clients manage them only through authenticated routes.
create table public.push_reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_verse_enabled boolean not null default false,
  daily_quest_enabled boolean not null default false,
  prayer_reminders_enabled boolean not null default false,
  weekly_recap_enabled boolean not null default false,
  delivery_time time not null default '08:00',
  timezone text not null default 'UTC',
  quiet_hours_start time not null default '21:00',
  quiet_hours_end time not null default '07:00',
  updated_at timestamptz not null default now(),
  constraint push_preferences_timezone_check check (
    pg_catalog.length(timezone) between 1 and 64
    and timezone ~ '^[A-Za-z0-9._+-]+(?:/[A-Za-z0-9._+-]+)*$'
  ),
  constraint push_preferences_time_check check (
    extract(second from delivery_time) = 0
    and pg_catalog.mod(
      extract(minute from delivery_time)::integer,
      15
    ) = 0
    and extract(second from quiet_hours_start) = 0
    and pg_catalog.mod(
      extract(minute from quiet_hours_start)::integer,
      15
    ) = 0
    and extract(second from quiet_hours_end) = 0
    and pg_catalog.mod(
      extract(minute from quiet_hours_end)::integer,
      15
    ) = 0
    and quiet_hours_start <> quiet_hours_end
  )
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint_fingerprint text not null unique,
  encrypted_subscription text not null,
  encryption_key_version integer not null,
  expiration_time timestamptz,
  transient_failures integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscription_fingerprint_check check (
    endpoint_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint push_subscription_ciphertext_check check (
    pg_catalog.length(encrypted_subscription) between 80 and 8192
    and encryption_key_version between 1 and 2147483647
  ),
  constraint push_subscription_expiration_check check (
    expiration_time is null
    or expiration_time > created_at - interval '1 day'
  ),
  constraint push_subscription_failures_check check (
    transient_failures between 0 and 10
  ),
  unique (id, user_id)
);
create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_kind text not null,
  reminder_date date not null,
  scheduled_for timestamptz not null,
  status text not null default 'sending',
  attempt_count integer not null default 1,
  claim_token uuid not null,
  claimed_at timestamptz not null default now(),
  next_attempt_at timestamptz,
  status_code_class integer,
  outcome_category text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_delivery_subscription_fk
    foreign key (subscription_id)
    references public.push_subscriptions(id)
    on delete set null,
  constraint push_delivery_kind_check check (
    reminder_kind in (
      'daily_verse',
      'daily_quest',
      'prayer_reminder',
      'weekly_recap',
      'test'
    )
  ),
  constraint push_delivery_status_check check (
    status in (
      'sending',
      'sent',
      'transient_failure',
      'permanent_failure'
    )
  ),
  constraint push_delivery_attempt_check check (
    attempt_count between 1 and 3
  ),
  constraint push_delivery_status_class_check check (
    status_code_class is null
    or status_code_class in (2, 4, 5)
  ),
  constraint push_delivery_outcome_check check (
    outcome_category is null
    or outcome_category in (
      'ok',
      'expired',
      'rate_limited',
      'provider',
      'network',
      'invalid',
      'retry_exhausted'
    )
  )
);
create unique index push_deliveries_scheduled_once_idx
  on public.push_deliveries (
    subscription_id,
    reminder_kind,
    reminder_date
  )
  where reminder_kind <> 'test';
create index push_deliveries_retry_idx
  on public.push_deliveries (status, next_attempt_at)
  where status in ('sending', 'transient_failure');
create index push_deliveries_user_idx
  on public.push_deliveries (user_id, created_at desc);

create table public.push_test_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claim_token uuid not null,
  last_claimed_at timestamptz not null default now()
);

-- Users may inspect only their own safe posture. Ciphertext, endpoint
-- fingerprints, claim tokens, and every direct mutation remain server-only.
alter table public.push_reminder_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
alter table public.push_test_claims enable row level security;

create policy "push preferences: read own"
on public.push_reminder_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "push subscriptions: read own"
on public.push_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "push deliveries: read own"
on public.push_deliveries
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.push_reminder_preferences
  from anon, authenticated;
revoke all on table public.push_subscriptions
  from anon, authenticated;
revoke all on table public.push_deliveries
  from anon, authenticated;
revoke all on table public.push_test_claims
  from anon, authenticated;

grant all on table public.push_reminder_preferences to service_role;
grant all on table public.push_subscriptions to service_role;
grant all on table public.push_deliveries to service_role;
grant all on table public.push_test_claims to service_role;
grant select on table public.push_reminder_preferences to authenticated;
grant select (
  id,
  user_id,
  expiration_time,
  transient_failures,
  last_success_at,
  last_failure_at,
  created_at,
  updated_at
) on public.push_subscriptions to authenticated;
grant select (
  id,
  user_id,
  reminder_kind,
  reminder_date,
  scheduled_for,
  status,
  attempt_count,
  status_code_class,
  outcome_category,
  delivered_at,
  created_at,
  updated_at
) on public.push_deliveries to authenticated;

-- Claims one scheduled delivery or one bounded retry. A stale sender may be
-- replaced after ten minutes, but its old token can never complete the row.
create or replace function public.claim_push_delivery(
  p_subscription_id uuid,
  p_user_id uuid,
  p_reminder_kind text,
  p_reminder_date date,
  p_scheduled_for timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  delivery public.push_deliveries%rowtype;
  token uuid := gen_random_uuid();
begin
  if p_subscription_id is null
     or p_user_id is null
     or p_reminder_kind not in (
       'daily_verse',
       'daily_quest',
       'prayer_reminder',
       'weekly_recap',
       'test'
     )
     or p_reminder_date is null
     or p_scheduled_for is null then
    raise exception 'push delivery: invalid claim'
      using errcode = '22023';
  end if;

  perform 1
  from public.push_subscriptions
  where id = p_subscription_id
    and user_id = p_user_id;
  if not found then
    raise exception 'push delivery: subscription unavailable'
      using errcode = 'P0002';
  end if;

  if p_reminder_kind = 'test' then
    insert into public.push_deliveries (
      subscription_id,
      user_id,
      reminder_kind,
      reminder_date,
      scheduled_for,
      claim_token
    ) values (
      p_subscription_id,
      p_user_id,
      p_reminder_kind,
      p_reminder_date,
      p_scheduled_for,
      token
    )
    returning * into delivery;
  else
    loop
      select *
      into delivery
      from public.push_deliveries
      where subscription_id = p_subscription_id
        and reminder_kind = p_reminder_kind
        and reminder_date = p_reminder_date
      for update;

      if not found then
        begin
          insert into public.push_deliveries (
            subscription_id,
            user_id,
            reminder_kind,
            reminder_date,
            scheduled_for,
            claim_token
          ) values (
            p_subscription_id,
            p_user_id,
            p_reminder_kind,
            p_reminder_date,
            p_scheduled_for,
            token
          )
          returning * into delivery;
          exit;
        exception
          when unique_violation then
            -- A concurrent claimant won; lock and inspect it on the next pass.
        end;
      elsif (
        (
          delivery.status = 'transient_failure'
          and delivery.attempt_count < 3
          and delivery.next_attempt_at <= pg_catalog.clock_timestamp()
        )
        or (
          delivery.status = 'sending'
          and delivery.claimed_at <=
            pg_catalog.clock_timestamp() - interval '10 minutes'
          and delivery.attempt_count < 3
        )
      ) then
        update public.push_deliveries
        set
          status = 'sending',
          attempt_count = attempt_count + 1,
          claim_token = token,
          claimed_at = pg_catalog.clock_timestamp(),
          next_attempt_at = null,
          status_code_class = null,
          outcome_category = null,
          updated_at = pg_catalog.clock_timestamp()
        where id = delivery.id
        returning * into delivery;
        exit;
      else
        return pg_catalog.jsonb_build_object('claimed', false);
      end if;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object(
    'claimed', true,
    'delivery_id', delivery.id,
    'claim_token', delivery.claim_token,
    'attempt', delivery.attempt_count
  );
end;
$function$;

-- Completes only the active claim token and schedules at most two retries.
create or replace function public.complete_push_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_status_code_class integer,
  p_category text,
  p_retry_after_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  delivery public.push_deliveries%rowtype;
  next_status text;
  next_category text;
begin
  if p_outcome not in ('sent', 'transient_failure', 'permanent_failure')
     or (
       p_status_code_class is not null
       and p_status_code_class not in (2, 4, 5)
     )
     or p_category not in (
       'ok',
       'expired',
       'rate_limited',
       'provider',
       'network',
       'invalid'
     ) then
    raise exception 'push delivery: invalid completion'
      using errcode = '22023';
  end if;

  select *
  into delivery
  from public.push_deliveries
  where id = p_delivery_id
    and claim_token = p_claim_token
    and status = 'sending'
  for update;
  if not found then return false;
  end if;

  if p_outcome = 'sent' then
    next_status := 'sent';
    next_category := 'ok';
  elsif p_outcome = 'transient_failure'
        and delivery.attempt_count < 3 then
    next_status := 'transient_failure';
    next_category := p_category;
  else
    next_status := 'permanent_failure';
    next_category := case
      when p_outcome = 'transient_failure' then 'retry_exhausted'
      else p_category
    end;
  end if;

  update public.push_deliveries
  set
    status = next_status,
    status_code_class = p_status_code_class,
    outcome_category = next_category,
    delivered_at = case
      when next_status = 'sent' then pg_catalog.clock_timestamp()
      else null
    end,
    next_attempt_at = case
      when next_status = 'transient_failure' then
        pg_catalog.clock_timestamp() + pg_catalog.make_interval(
          secs => greatest(
            60,
            least(
              coalesce(p_retry_after_seconds, 300),
              3600
            )
          )
        )
      else null
    end,
    updated_at = pg_catalog.clock_timestamp()
  where id = delivery.id;

  -- Keeps endpoint lifecycle and bounded health posture in this transaction.
  if next_status = 'permanent_failure'
     and next_category in ('expired', 'invalid') then
    delete from public.push_subscriptions
    where id = delivery.subscription_id
      and user_id = delivery.user_id;
  elsif next_status = 'sent' then
    update public.push_subscriptions
    set
      transient_failures = 0,
      last_success_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where id = delivery.subscription_id
      and user_id = delivery.user_id;
  else
    update public.push_subscriptions
    set
      transient_failures = least(transient_failures + 1, 10),
      last_failure_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where id = delivery.subscription_id
      and user_id = delivery.user_id;
  end if;
  return true;
end;
$function$;

-- Allows one neutral test notification per account every five minutes.
create or replace function public.claim_push_test(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  token uuid := gen_random_uuid();
  claimed public.push_test_claims%rowtype;
begin
  if p_user_id is null
     or not exists (
       select 1 from auth.users where id = p_user_id
     ) then
    raise exception 'push test: user unavailable'
      using errcode = 'P0002';
  end if;

  insert into public.push_test_claims (
    user_id,
    claim_token,
    last_claimed_at
  ) values (
    p_user_id,
    token,
    pg_catalog.clock_timestamp()
  )
  on conflict (user_id) do update
  set
    claim_token = excluded.claim_token,
    last_claimed_at = excluded.last_claimed_at
  where push_test_claims.last_claimed_at <=
    pg_catalog.clock_timestamp() - interval '5 minutes'
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

-- Keeps content-free delivery metrics bounded to ninety days.
create or replace function public.purge_stale_push_records()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  removed integer;
begin
  delete from public.push_deliveries
  where created_at < pg_catalog.clock_timestamp() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$function$;

alter function public.claim_push_delivery(
  uuid, uuid, text, date, timestamptz
) owner to postgres;
alter function public.complete_push_delivery(
  uuid, uuid, text, integer, text, integer
) owner to postgres;
alter function public.claim_push_test(uuid) owner to postgres;
alter function public.purge_stale_push_records() owner to postgres;

revoke all on function public.claim_push_delivery(
  uuid, uuid, text, date, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.complete_push_delivery(
  uuid, uuid, text, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.claim_push_test(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.purge_stale_push_records()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_push_delivery(
  uuid, uuid, text, date, timestamptz
) to service_role;
grant execute on function public.complete_push_delivery(
  uuid, uuid, text, integer, text, integer
) to service_role;
grant execute on function public.claim_push_test(uuid)
  to service_role;
grant execute on function public.purge_stale_push_records()
  to service_role;

-- Content-free readiness proves encryption-column isolation, RLS, grants, and
-- the service-only atomic functions used by scheduler and test delivery.
create or replace function public.push_reminder_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with expected_tables(table_name) as (
  values
    ('push_reminder_preferences'),
    ('push_subscriptions'),
    ('push_deliveries'),
    ('push_test_claims')
), table_posture as (
  select
    pg_catalog.count(*) = 4
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
    pg_catalog.count(*) = 3
    and pg_catalog.bool_and(
      policy.roles = array['authenticated']::name[]
      and policy.cmd = 'SELECT'
      and policy.qual like '%auth.uid%'
      and policy.with_check is null
    ) as ok
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.policyname in (
      'push preferences: read own',
      'push subscriptions: read own',
      'push deliveries: read own'
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
  select pg_catalog.count(*) = 4 as ok
  from expected_tables
  where pg_catalog.has_table_privilege(
    'service_role',
    'public.' || expected_tables.table_name,
    'SELECT,INSERT,UPDATE,DELETE'
  )
), sealed_ciphertext as (
  select
    not pg_catalog.has_column_privilege(
      'authenticated',
      'public.push_subscriptions',
      'endpoint_fingerprint',
      'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated',
      'public.push_subscriptions',
      'encrypted_subscription',
      'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated',
      'public.push_subscriptions',
      'encryption_key_version',
      'SELECT'
    ) as ok
), expected_functions(signature) as (
  values
    ('public.claim_push_delivery(uuid,uuid,text,date,timestamp with time zone)'),
    ('public.complete_push_delivery(uuid,uuid,text,integer,text,integer)'),
    ('public.claim_push_test(uuid)'),
    ('public.purge_stale_push_records()')
), function_posture as (
  select
    pg_catalog.count(*) = 4
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
  'biblequest_private_push_v1',
  'ok',
    coalesce((select ok from table_posture), false)
    and coalesce((select ok from policy_posture), false)
    and coalesce((select ok from sealed_mutations), false)
    and coalesce((select ok from service_table_access), false)
    and coalesce((select ok from sealed_ciphertext), false)
    and coalesce((select ok from function_posture), false)
);
$function$;

alter function public.push_reminder_contract() owner to postgres;
revoke all on function public.push_reminder_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.push_reminder_contract()
  to anon, authenticated, service_role;
