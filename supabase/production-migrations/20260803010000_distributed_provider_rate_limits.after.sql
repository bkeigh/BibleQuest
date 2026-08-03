-- Proves the sealed table, service-only claim, and bounded readiness contract.
do $biblequest_provider_rate_postflight$
declare
  row_security boolean;
  force_row_security boolean;
begin
  if public.provider_rate_limit_contract() is distinct from
      '{"contract":"biblequest_provider_rate_limit_v1","ok":true}'::jsonb
    or not pg_catalog.has_function_privilege(
      'anon', 'public.provider_rate_limit_contract()', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated', 'public.provider_rate_limit_contract()', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.claim_provider_rate_limit(text,text,integer,integer)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.claim_provider_rate_limit(text,text,integer,integer)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',
      'public.claim_provider_rate_limit(text,text,integer,integer)',
      'EXECUTE'
    )
  then
    raise exception 'production 0034 provider rate limit posture is invalid';
  end if;

  select relation.relrowsecurity, relation.relforcerowsecurity
  into row_security, force_row_security
  from pg_catalog.pg_class as relation
  where relation.oid = 'public.provider_rate_limit_windows'::regclass;

  if row_security is distinct from true
    or force_row_security is distinct from true
    or pg_catalog.has_table_privilege(
      'anon', 'public.provider_rate_limit_windows', 'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', 'public.provider_rate_limit_windows', 'SELECT'
    )
  then
    raise exception 'production 0034 provider bucket isolation is invalid';
  end if;
end;
$biblequest_provider_rate_postflight$;
