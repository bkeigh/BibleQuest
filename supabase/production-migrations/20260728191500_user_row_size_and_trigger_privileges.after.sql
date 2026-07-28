-- Prove the transaction installed all sixteen caps and sealed both trigger helpers.
do $biblequest_production_postflight$
declare
  secured_trigger_count integer;
  function_is_definer boolean;
  function_settings text[];
begin
  select procedure.prosecdef, procedure.proconfig
  into function_is_definer, function_settings
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.enforce_user_owned_row_size()'
  );

  if function_is_definer is distinct from false
    or function_settings is distinct from array['search_path=""']::text[]
  then
    raise exception 'production row-size function posture is invalid';
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

  if secured_trigger_count <> 16 then
    raise exception 'production row-size trigger count is invalid';
  end if;

  if pg_catalog.has_function_privilege(
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
    raise exception 'production trigger helper grants are invalid';
  end if;
end;
$biblequest_production_postflight$;
