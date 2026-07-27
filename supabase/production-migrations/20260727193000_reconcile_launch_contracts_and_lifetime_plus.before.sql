-- Abort unless production has the reviewed 0023-0027 contracts and no billing rows.
do $biblequest_production_preflight$
declare
  contract_value jsonb;
  lifetime_column_count integer;
  audit_table_rls boolean;
  audit_table_force_rls boolean;
begin
  if exists (select 1 from public.subscriptions) then
    raise exception 'production lifetime migration requires zero subscription rows';
  end if;

  select pg_catalog.count(*)::integer
  into lifetime_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'subscriptions'
    and column_name in (
      'livemode',
      'stripe_checkout_session_id',
      'stripe_payment_intent_id',
      'amount_total',
      'amount_refunded',
      'outcome_status',
      'dispute_status'
    );

  if lifetime_column_count <> 0 then
    raise exception 'production lifetime migration found a partial 0028 schema';
  end if;

  contract_value := public.profile_avatar_contract();
  if contract_value <> pg_catalog.jsonb_build_object(
    'contract', 'biblequest_profile_avatar_v1',
    'ok', true
  ) then
    raise exception 'production profile avatar contract is not ready';
  end if;

  contract_value := public.push_reminder_contract();
  if contract_value <> pg_catalog.jsonb_build_object(
    'contract', 'biblequest_private_push_v1',
    'ok', true
  ) then
    raise exception 'production push reminder contract is not ready';
  end if;

  contract_value := public.stripe_billing_contract();
  if contract_value <> pg_catalog.jsonb_build_object(
    'contract', 'biblequest_stripe_test_billing_v1',
    'ok', true
  ) then
    raise exception 'production Stripe v1 contract is not ready';
  end if;

  contract_value := public.stripe_support_contract();
  if contract_value <> pg_catalog.jsonb_build_object(
    'contract', 'biblequest_stripe_one_time_support_v1',
    'ok', true
  ) then
    raise exception 'production support contract is not ready';
  end if;

  select class.relrowsecurity, class.relforcerowsecurity
  into audit_table_rls, audit_table_force_rls
  from pg_catalog.pg_class as class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'console_audit_logs'
    and class.relkind = 'r';

  if coalesce(audit_table_rls, false) is not true
    or coalesce(audit_table_force_rls, false) is not true
  then
    raise exception 'production console audit table is not sealed';
  end if;

  if pg_catalog.to_regprocedure(
    'public.console_insights(integer)'
  ) is null
    or pg_catalog.to_regprocedure(
      'public.append_console_audit_log(uuid,text,text,text,text,text,jsonb)'
    ) is null
  then
    raise exception 'production console functions are missing';
  end if;

  if pg_catalog.has_table_privilege(
    'anon', 'public.console_audit_logs', 'SELECT'
  )
    or pg_catalog.has_table_privilege(
      'authenticated', 'public.console_audit_logs', 'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'anon', 'public.console_audit_logs', 'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', 'public.console_audit_logs', 'INSERT'
    )
    or not pg_catalog.has_table_privilege(
      'service_role', 'public.console_audit_logs', 'SELECT'
    )
    or not pg_catalog.has_table_privilege(
      'service_role', 'public.console_audit_logs', 'INSERT'
    )
  then
    raise exception 'production console audit grants are invalid';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role', 'public.console_insights(integer)', 'EXECUTE'
  )
    or pg_catalog.has_function_privilege(
      'anon', 'public.console_insights(integer)', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated', 'public.console_insights(integer)', 'EXECUTE'
    )
  then
    raise exception 'production console insights grants are invalid';
  end if;
end;
$biblequest_production_preflight$;
