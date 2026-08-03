-- Executes one disposable claim and re-proves the sealed corrected boundary.
do $biblequest_provider_rate_fix_postflight$
declare
  probe jsonb;
  row_security boolean;
  force_row_security boolean;
begin
  if public.provider_rate_limit_contract() is distinct from
      '{"contract":"biblequest_provider_rate_limit_v2","ok":true}'::jsonb
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
    raise exception 'production 0035 provider rate limit posture is invalid';
  end if;

  delete from public.provider_rate_limit_windows
  where scope = 'migration-probe'
    and bucket_hash = repeat('f', 64)
    and window_seconds = 60;

  probe := public.claim_provider_rate_limit(
    'migration-probe', repeat('f', 64), 1, 60
  );
  if (probe->>'allowed')::boolean is distinct from true
    or (probe->>'retry_after')::integer not between 1 and 60
    or (probe->>'remaining')::integer is distinct from 0
  then
    raise exception 'production 0035 provider rate limit claim is invalid';
  end if;

  delete from public.provider_rate_limit_windows
  where scope = 'migration-probe'
    and bucket_hash = repeat('f', 64)
    and window_seconds = 60;

  select relation.relrowsecurity, relation.relforcerowsecurity
  into row_security, force_row_security
  from pg_catalog.pg_class as relation
  where relation.oid = 'public.provider_rate_limit_windows'::regclass;

  if row_security is distinct from true
    or force_row_security is distinct from true
  then
    raise exception 'production 0035 provider bucket isolation is invalid';
  end if;
end;
$biblequest_provider_rate_fix_postflight$;
