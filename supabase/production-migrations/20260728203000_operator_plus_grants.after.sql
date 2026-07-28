-- Prove the complete entitlement, audit, RLS, and function posture afterward.
do $biblequest_operator_plus_postflight$
declare
  contract_value jsonb;
  open_index_count integer;
  mutation_function_count integer;
begin
  contract_value := public.operator_plus_grant_contract();
  if contract_value <> pg_catalog.jsonb_build_object(
    'contract', 'biblequest_operator_plus_grant_v1',
    'ok', true
  ) then
    raise exception 'production operator Plus contract is invalid';
  end if;

  if exists (select 1 from public.operator_plus_grants) then
    raise exception 'production operator Plus migration created unexpected data';
  end if;

  select pg_catalog.count(*)::integer
  into open_index_count
  from pg_catalog.pg_index as index_record
  join pg_catalog.pg_class as index_class
    on index_class.oid = index_record.indexrelid
  where index_record.indrelid = 'public.operator_plus_grants'::regclass
    and index_class.relname = 'operator_plus_grants_open_user_idx'
    and index_record.indisunique
    and pg_catalog.pg_get_expr(
      index_record.indpred,
      index_record.indrelid
    ) like '%revoked_at IS NULL%';

  if open_index_count <> 1 then
    raise exception 'production operator Plus unique-open index is invalid';
  end if;

  select pg_catalog.count(*)::integer
  into mutation_function_count
  from pg_catalog.pg_proc as procedure
  where procedure.oid = any(array[
    pg_catalog.to_regprocedure(
      'public.grant_operator_plus(uuid,text,text,uuid,text)'
    ),
    pg_catalog.to_regprocedure(
      'public.revoke_operator_plus(uuid,text,uuid,text)'
    )
  ])
    and procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[];

  if mutation_function_count <> 2 then
    raise exception 'production operator Plus function posture is invalid';
  end if;

  if pg_catalog.has_table_privilege(
    'anon',
    'public.operator_plus_grants',
    'SELECT,INSERT,UPDATE,DELETE'
  )
    or pg_catalog.has_table_privilege(
      'authenticated',
      'public.operator_plus_grants',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.operator_plus_grants',
      'INSERT,UPDATE,DELETE'
    )
    or not pg_catalog.has_table_privilege(
      'service_role',
      'public.operator_plus_grants',
      'SELECT'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.grant_operator_plus(uuid,text,text,uuid,text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.revoke_operator_plus(uuid,text,uuid,text)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',
      'public.grant_operator_plus(uuid,text,text,uuid,text)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',
      'public.revoke_operator_plus(uuid,text,uuid,text)',
      'EXECUTE'
    )
  then
    raise exception 'production operator Plus grants are invalid';
  end if;
end;
$biblequest_operator_plus_postflight$;
