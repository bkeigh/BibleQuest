-- Abort unless production has the reviewed 0029 and console-audit posture.
do $biblequest_operator_plus_preflight$
declare
  stripe_contract jsonb;
  secured_trigger_count integer;
  audit_rls boolean;
  audit_force_rls boolean;
begin
  stripe_contract := public.stripe_billing_contract();
  if stripe_contract <> pg_catalog.jsonb_build_object(
    'contract', 'biblequest_stripe_test_billing_v2',
    'ok', true
  ) then
    raise exception 'production Stripe contract is not ready';
  end if;

  if pg_catalog.to_regprocedure(
    'public.enforce_user_owned_row_size()'
  ) is null then
    raise exception 'production 0029 row-size boundary is missing';
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

  if secured_trigger_count <> 16 then
    raise exception 'production 0029 trigger posture is invalid';
  end if;

  select class.relrowsecurity, class.relforcerowsecurity
  into audit_rls, audit_force_rls
  from pg_catalog.pg_class as class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'console_audit_logs'
    and class.relkind = 'r';

  if audit_rls is distinct from true
    or audit_force_rls is distinct from true
    or pg_catalog.to_regprocedure(
      'public.append_console_audit_log(uuid,text,text,text,text,text,jsonb)'
    ) is null
  then
    raise exception 'production console audit posture is invalid';
  end if;

  if pg_catalog.to_regclass('public.operator_plus_grants') is not null
    or pg_catalog.to_regprocedure(
      'public.grant_operator_plus(uuid,text,text,uuid,text)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.revoke_operator_plus(uuid,text,uuid,text)'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.operator_plus_grant_contract()'
    ) is not null
  then
    raise exception 'production operator Plus found a partial 0030 schema';
  end if;
end;
$biblequest_operator_plus_preflight$;
