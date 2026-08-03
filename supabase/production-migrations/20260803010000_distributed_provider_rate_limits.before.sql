-- Refuses 0034 unless production has the complete 0033 contract and no partial
-- provider-rate boundary already exists.
do $biblequest_provider_rate_preflight$
begin
  if public.guided_progress_sync_contract() is distinct from
      '{"contract":"biblequest_guided_progress_sync_v1","ok":true}'::jsonb
    or not pg_catalog.has_function_privilege(
      'anon', 'public.guided_progress_sync_contract()', 'EXECUTE'
    )
  then
    raise exception 'production 0033 guided progress posture is invalid';
  end if;

  if pg_catalog.to_regclass(
      'public.provider_rate_limit_windows'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.claim_provider_rate_limit(text,text,integer,integer)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.provider_rate_limit_contract()'
    ) is not null
  then
    raise exception 'production provider rate limit found a partial 0034 schema';
  end if;
end;
$biblequest_provider_rate_preflight$;
