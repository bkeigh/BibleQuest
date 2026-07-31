-- Refuse the guided-progress migration unless production is on the exact
-- reviewed 0032 baseline and no partial 0033 boundary exists.
do $biblequest_production_guided_progress_preflight$
declare
  dispute_constraint_count integer;
  secured_trigger_count integer;
  purge_source text;
begin
  if public.stripe_billing_contract() is distinct from
      '{"contract":"biblequest_stripe_test_billing_v2","ok":true}'::jsonb
    or public.stripe_support_contract() is distinct from
      '{"contract":"biblequest_stripe_one_time_support_v1","ok":true}'::jsonb
    or public.operator_plus_grant_contract() is distinct from
      '{"contract":"biblequest_operator_plus_grant_v1","ok":true}'::jsonb
  then
    raise exception 'production guided progress baseline is invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.subscriptions'::regclass
      and constraint_record.conname =
        'subscriptions_external_subscription_key'
      and constraint_record.contype = 'u'
  ) then
    raise exception 'production 0031 subscription posture is invalid';
  end if;

  select pg_catalog.count(*)::integer
  into dispute_constraint_count
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.stripe_billing_signals'::regclass
    and constraint_record.conname = 'stripe_signal_object_check'
    and constraint_record.contype = 'c'
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_record.oid),
      '^(in|re|du)_[A-Za-z0-9]+$'
    ) > 0
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_record.oid),
      '^(in|re|dp)_[A-Za-z0-9]+$'
    ) = 0;

  if dispute_constraint_count <> 1 then
    raise exception 'production 0032 dispute signal posture is invalid';
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

  select procedure.prosrc
  into purge_source
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.purge_user_data_internal()'
  );

  if pg_catalog.to_regclass('public.user_guided_movements') is not null
    or pg_catalog.to_regprocedure(
      'public.guided_progress_sync_contract()'
    ) is not null
    or purge_source is null
    or purge_source like '%user_guided_movements%'
  then
    raise exception 'production guided progress found a partial 0033 schema';
  end if;
end;
$biblequest_production_guided_progress_preflight$;
