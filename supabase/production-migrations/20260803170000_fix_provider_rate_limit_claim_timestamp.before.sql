-- Refuses the correction unless the complete immutable 0034 boundary exists.
do $biblequest_provider_rate_fix_preflight$
begin
  if public.provider_rate_limit_contract() is distinct from
      '{"contract":"biblequest_provider_rate_limit_v1","ok":true}'::jsonb
    or pg_catalog.to_regclass(
      'public.provider_rate_limit_windows'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.claim_provider_rate_limit(text,text,integer,integer)'
    ) is null
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
    raise exception 'production 0034 provider rate limit prerequisite is invalid';
  end if;
end;
$biblequest_provider_rate_fix_preflight$;
