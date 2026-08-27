-- Refuses bounded retention unless the complete immutable v2 boundary exists.
do $biblequest_provider_rate_retention_preflight$
declare
  existing_jobs integer := 0;
begin
  -- Refuses to overwrite an operator-created job with the release job name.
  if pg_catalog.to_regclass('cron.job') is not null then
    execute $sql$
      select count(*)::integer
      from cron.job
      where jobname = 'biblequest-provider-rate-limit-retention-v1'
    $sql$
    into existing_jobs;
  end if;

  if public.provider_rate_limit_contract() is distinct from
      '{"contract":"biblequest_provider_rate_limit_v2","ok":true}'::jsonb
    or pg_catalog.to_regclass(
      'public.provider_rate_limit_windows'
    ) is null
    or pg_catalog.to_regclass(
      'public.provider_rate_limit_windows_updated_at_idx'
    ) is not null
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
    or existing_jobs <> 0
  then
    raise exception 'production provider rate-limit v2 prerequisite is invalid';
  end if;
end;
$biblequest_provider_rate_retention_preflight$;
