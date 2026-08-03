-- Adds deployment-wide fixed-window claims for provider-backed server routes.
-- Buckets are opaque HMAC digests; raw account and network identifiers never
-- enter this table, logs, evidence, or client-readable database surfaces.

create table public.provider_rate_limit_windows (
  scope text not null check (
    scope ~ '^[a-z0-9][a-z0-9:-]{0,79}$'
  ),
  bucket_hash text not null check (
    bucket_hash ~ '^[a-f0-9]{64}$'
  ),
  window_seconds integer not null check (
    window_seconds between 10 and 86400
  ),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 10000000),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (scope, bucket_hash, window_seconds)
);

alter table public.provider_rate_limit_windows enable row level security;
alter table public.provider_rate_limit_windows force row level security;

revoke all on table public.provider_rate_limit_windows
  from public, anon, authenticated, service_role;
grant all on table public.provider_rate_limit_windows to service_role;

-- Atomically increments one fixed window and returns only bounded counters.
create or replace function public.claim_provider_rate_limit(
  p_scope text,
  p_bucket_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_time timestamptz := pg_catalog.clock_timestamp();
  current_epoch numeric := extract(epoch from current_time);
  current_window timestamptz;
  claimed_count integer;
  retry_after integer;
begin
  if p_scope is null
     or p_scope !~ '^[a-z0-9][a-z0-9:-]{0,79}$'
     or p_bucket_hash is null
     or p_bucket_hash !~ '^[a-f0-9]{64}$'
     or p_limit not between 1 and 1000000
     or p_window_seconds not between 10 and 86400 then
    raise exception 'provider rate limit: invalid claim'
      using errcode = '22023';
  end if;

  current_window := pg_catalog.to_timestamp(
    pg_catalog.floor(current_epoch / p_window_seconds) * p_window_seconds
  );

  insert into public.provider_rate_limit_windows (
    scope,
    bucket_hash,
    window_seconds,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_scope,
    p_bucket_hash,
    p_window_seconds,
    current_window,
    1,
    current_time
  )
  on conflict (scope, bucket_hash, window_seconds) do update
  set
    window_started_at = current_window,
    request_count = case
      when provider_rate_limit_windows.window_started_at < current_window then 1
      else provider_rate_limit_windows.request_count + 1
    end,
    updated_at = current_time
  returning request_count into claimed_count;

  retry_after := greatest(
    1,
    pg_catalog.ceil(
      extract(
        epoch from current_window
          + pg_catalog.make_interval(secs => p_window_seconds)
          - current_time
      )
    )::integer
  );

  return pg_catalog.jsonb_build_object(
    'allowed', claimed_count <= p_limit,
    'retry_after', retry_after,
    'remaining', greatest(0, p_limit - claimed_count)
  );
end;
$function$;

-- Exposes only a fixed readiness identity, never bucket or request data.
create or replace function public.provider_rate_limit_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'contract', 'biblequest_provider_rate_limit_v1'
  );
$function$;

alter function public.claim_provider_rate_limit(text, text, integer, integer)
  owner to postgres;
alter function public.provider_rate_limit_contract() owner to postgres;

revoke all on function public.claim_provider_rate_limit(
  text, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_provider_rate_limit(
  text, text, integer, integer
) to service_role;

revoke all on function public.provider_rate_limit_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.provider_rate_limit_contract()
  to anon, authenticated, service_role;
