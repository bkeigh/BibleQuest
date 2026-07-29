-- Attest that staging matches the frozen 31-file schema without inventing
-- history for 0029, 0030, or 0032. The guarded runner proves the full diff.
do $biblequest_staging_manifest_reconciliation$
declare
  actual_history text[];
  secured_trigger_count integer;
  operator_function_count integer;
  operator_index_count integer;
  subscription_constraint_count integer;
  dispute_constraint_count integer;
begin
  select coalesce(
    pg_catalog.array_agg(version::text order by version::text),
    array[]::text[]
  )
  into actual_history
  from supabase_migrations.schema_migrations;

  if actual_history is distinct from array[
    '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008',
    '0009', '0010', '0011', '0012', '0014', '0015', '0016', '0017',
    '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025',
    '0026', '0027', '0028', '0031'
  ]::text[] then
    raise exception 'staging migration prehistory is not the reviewed 28-row state';
  end if;

  if public.profile_avatar_contract() is distinct from
    '{"contract":"biblequest_profile_avatar_v1","ok":true}'::jsonb
    or public.push_reminder_contract() is distinct from
      '{"contract":"biblequest_private_push_v1","ok":true}'::jsonb
    or public.stripe_billing_contract() is distinct from
      '{"contract":"biblequest_stripe_test_billing_v2","ok":true}'::jsonb
    or public.stripe_support_contract() is distinct from
      '{"contract":"biblequest_stripe_one_time_support_v1","ok":true}'::jsonb
    or public.operator_plus_grant_contract() is distinct from
      '{"contract":"biblequest_operator_plus_grant_v1","ok":true}'::jsonb
  then
    raise exception 'staging schema contract posture is invalid';
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
    and relation.relname = any(array[
      'profiles',
      'user_settings',
      'notification_preferences',
      'user_daily_quests',
      'user_daily_quest_days',
      'user_quests',
      'quest_completions',
      'prayers',
      'reflections',
      'journey_events',
      'growth_events',
      'user_milestones',
      'verse_bookmarks',
      'reading_progress',
      'chapters_read',
      'user_recent_verses'
    ])
    and trigger.tgname = 'enforce_user_owned_row_size'
    and not trigger.tgisinternal
    and trigger.tgenabled <> 'D'
    and procedure.proname = 'enforce_user_owned_row_size';

  if secured_trigger_count <> 16
    or pg_catalog.has_function_privilege(
      'anon', 'public.enforce_user_owned_row_size()', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated', 'public.enforce_user_owned_row_size()', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role', 'public.enforce_user_owned_row_size()', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon', 'public.ensure_journey_event_date_key()', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated', 'public.ensure_journey_event_date_key()', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role', 'public.ensure_journey_event_date_key()', 'EXECUTE'
    )
  then
    raise exception 'staging 0029 row-size posture is invalid';
  end if;

  select pg_catalog.count(*)::integer
  into operator_index_count
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

  select pg_catalog.count(*)::integer
  into operator_function_count
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

  if operator_index_count <> 1
    or operator_function_count <> 2
  then
    raise exception 'staging 0030 operator Plus posture is invalid';
  end if;

  select pg_catalog.count(*)::integer
  into subscription_constraint_count
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.subscriptions'::regclass
    and constraint_record.conname =
      'subscriptions_external_subscription_key'
    and constraint_record.contype = 'u'
    and (
      select pg_catalog.array_agg(attribute.attname order by key.ordinality)
      from pg_catalog.unnest(
        constraint_record.conkey
      ) with ordinality as key(attnum, ordinality)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = constraint_record.conrelid
        and attribute.attnum = key.attnum
    ) = array['external_subscription_id']::name[];

  if subscription_constraint_count <> 1
    or pg_catalog.to_regclass(
      'public.subscriptions_external_subscription_idx'
    ) is not null
  then
    raise exception 'staging 0031 subscription conflict posture is invalid';
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
    ) > 0;

  if dispute_constraint_count <> 1 then
    raise exception 'staging 0032 dispute signal posture is invalid';
  end if;
end;
$biblequest_staging_manifest_reconciliation$;
