-- Proves the v3 identity, privileges, index, and 48-hour cleanup behavior.
do $biblequest_provider_rate_retention_postflight$
declare
  probe jsonb;
  stale_rows integer;
  scheduled_jobs integer;
  row_security boolean;
  force_row_security boolean;
begin
  if public.provider_rate_limit_contract() is distinct from
      '{"contract":"biblequest_provider_rate_limit_v3","ok":true}'::jsonb
    or pg_catalog.to_regclass(
      'public.provider_rate_limit_windows_updated_at_idx'
    ) is null
    or not pg_catalog.has_function_privilege(
      'anon', 'public.provider_rate_limit_contract()', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated', 'public.provider_rate_limit_contract()', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',
      'public.claim_provider_rate_limit(text,text,integer,integer)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.claim_provider_rate_limit(text,text,integer,integer)',
      'EXECUTE'
    )
  then
    raise exception 'production provider rate-limit v3 posture is invalid';
  end if;

  insert into public.provider_rate_limit_windows (
    scope,
    bucket_hash,
    window_seconds,
    window_started_at,
    request_count,
    updated_at
  ) values (
    'migration-stale-probe',
    repeat('e', 64),
    60,
    pg_catalog.clock_timestamp() - interval '72 hours',
    1,
    pg_catalog.clock_timestamp() - interval '72 hours'
  );

  probe := public.claim_provider_rate_limit(
    'migration-live-probe', repeat('f', 64), 1, 60
  );
  if (probe->>'allowed')::boolean is distinct from true
    or (probe->>'retry_after')::integer not between 1 and 60
    or (probe->>'remaining')::integer is distinct from 0
  then
    raise exception 'production provider rate-limit v3 claim is invalid';
  end if;

  select count(*)
  into stale_rows
  from public.provider_rate_limit_windows
  where scope = 'migration-stale-probe';
  if stale_rows is distinct from 0 then
    raise exception 'production provider rate-limit retention is invalid';
  end if;

  -- Requires one active hourly purge with the exact reviewed deletion command.
  select count(*)::integer
  into scheduled_jobs
  from cron.job
  where jobname = 'biblequest-provider-rate-limit-retention-v1'
    and schedule = '17 * * * *'
    and active
    and command = $command$
    delete from public.provider_rate_limit_windows
    where updated_at < pg_catalog.clock_timestamp() - interval '48 hours';
  $command$;
  if scheduled_jobs is distinct from 1 then
    raise exception 'production provider retention schedule is invalid';
  end if;

  delete from public.provider_rate_limit_windows
  where scope = 'migration-live-probe'
    and bucket_hash = repeat('f', 64)
    and window_seconds = 60;

  select relation.relrowsecurity, relation.relforcerowsecurity
  into row_security, force_row_security
  from pg_catalog.pg_class as relation
  where relation.oid = 'public.provider_rate_limit_windows'::regclass;

  if row_security is distinct from true
    or force_row_security is distinct from true
  then
    raise exception 'production provider bucket isolation is invalid';
  end if;
end;
$biblequest_provider_rate_retention_postflight$;
