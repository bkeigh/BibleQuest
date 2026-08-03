-- Corrects PL/pgSQL variable names that collided with SQL CURRENT_TIME.
-- The service-only boundary and opaque fixed-window model remain unchanged.

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
  claim_time timestamptz := pg_catalog.clock_timestamp();
  claim_epoch numeric := extract(epoch from claim_time);
  claim_window timestamptz;
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

  claim_window := pg_catalog.to_timestamp(
    pg_catalog.floor(claim_epoch / p_window_seconds) * p_window_seconds
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
    claim_window,
    1,
    claim_time
  )
  on conflict (scope, bucket_hash, window_seconds) do update
  set
    window_started_at = claim_window,
    request_count = case
      when provider_rate_limit_windows.window_started_at < claim_window then 1
      else provider_rate_limit_windows.request_count + 1
    end,
    updated_at = claim_time
  returning request_count into claimed_count;

  retry_after := greatest(
    1,
    pg_catalog.ceil(
      extract(
        epoch from claim_window
          + pg_catalog.make_interval(secs => p_window_seconds)
          - claim_time
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

-- Advances the readiness identity only after the corrected claim is installed.
create or replace function public.provider_rate_limit_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'contract', 'biblequest_provider_rate_limit_v2'
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
