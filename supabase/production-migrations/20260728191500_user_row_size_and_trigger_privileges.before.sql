-- Abort unless production has the reviewed 0028 state and no partial 0029 objects.
do $biblequest_production_preflight$
declare
  contract_value jsonb;
  table_name text;
  row_security_enabled boolean;
  oversized_row_exists boolean;
begin
  contract_value := public.stripe_billing_contract();
  if contract_value <> pg_catalog.jsonb_build_object(
    'contract', 'biblequest_stripe_test_billing_v2',
    'ok', true
  ) then
    raise exception 'production Stripe v2 contract is not ready';
  end if;

  if pg_catalog.to_regprocedure(
    'public.ensure_journey_event_date_key()'
  ) is null then
    raise exception 'production Journey trigger contract is missing';
  end if;

  if pg_catalog.to_regprocedure(
    'public.enforce_user_owned_row_size()'
  ) is not null
    or exists (
      select 1
      from pg_catalog.pg_trigger as trigger
      join pg_catalog.pg_class as relation
        on relation.oid = trigger.tgrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and trigger.tgname = 'enforce_user_owned_row_size'
        and not trigger.tgisinternal
    )
  then
    raise exception 'production user-row hardening found a partial 0029 schema';
  end if;

  foreach table_name in array array[
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
  ]
  loop
    select class.relrowsecurity
    into row_security_enabled
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = table_name
      and class.relkind = 'r';

    if coalesce(row_security_enabled, false) is not true then
      raise exception 'production synced table is missing RLS';
    end if;

    execute pg_catalog.format(
      'select exists (' ||
      'select 1 from public.%I as owned_row ' ||
      'where pg_catalog.pg_column_size(owned_row) > 1048576' ||
      ')',
      table_name
    )
    into oversized_row_exists;

    if oversized_row_exists then
      raise exception 'production contains an existing oversized synced row';
    end if;
  end loop;
end;
$biblequest_production_preflight$;
