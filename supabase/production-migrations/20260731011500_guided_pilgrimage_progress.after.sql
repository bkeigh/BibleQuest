-- Prove the complete guided-progress boundary, its public readiness contract,
-- and the expected post-0033 row-size trigger inventory.
do $biblequest_production_guided_progress_postflight$
declare
  secured_trigger_count integer;
begin
  if public.guided_progress_sync_contract() is distinct from
      '{"contract":"biblequest_guided_progress_sync_v1","ok":true}'::jsonb
    or not pg_catalog.has_function_privilege(
      'anon',
      'public.guided_progress_sync_contract()',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',
      'public.guided_progress_sync_contract()',
      'EXECUTE'
    )
  then
    raise exception 'production 0033 guided progress posture is invalid';
  end if;

  select pg_catalog.count(*)::integer
  into secured_trigger_count
  from pg_catalog.pg_trigger as trigger
  join pg_catalog.pg_proc as procedure
    on procedure.oid = trigger.tgfoid
  join pg_catalog.pg_class as relation
    on relation.oid = trigger.tgrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and trigger.tgname = 'enforce_user_owned_row_size'
    and not trigger.tgisinternal
    and trigger.tgenabled <> 'D'
    and procedure.proname = 'enforce_user_owned_row_size';

  if secured_trigger_count <> 17 then
    raise exception 'production 0033 row-size posture is invalid';
  end if;
end;
$biblequest_production_guided_progress_postflight$;
