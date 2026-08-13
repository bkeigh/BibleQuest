-- Prove the native boundary installed completely and remains disabled.
do $gate$
declare
  helper_source text;
  guarded_relations text[] := array[
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
    'user_recent_verses',
    'user_guided_movements',
    'user_sync_state'
  ];
begin
  if public.native_account_beta_availability() is distinct from
       '{"available":false,"contract":"biblequest_native_account_beta_v1"}'::jsonb
     or not exists (
       select 1
       from public.feature_flags
       where key = 'native_account_beta'
         and enabled = false
     ) then
    raise exception 'native account flag was not installed fail-closed';
  end if;

  select procedure.prosrc
  into helper_source
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.native_account_beta_request_allowed()'
  );
  if helper_source is null
     or helper_source not like '%x-biblequest-native-account-beta%'
     or helper_source not like '%native_account_beta%'
     or pg_catalog.to_regclass(
       'public.account_deletion_latches'
     ) is null then
    raise exception 'native account request boundary is incomplete';
  end if;

  if exists (
    select guarded_relation.name
    from pg_catalog.unnest(guarded_relations)
      as guarded_relation(name)
    where not exists (
      select 1
      from pg_catalog.pg_policies as policy
      where policy.schemaname = 'public'
        and policy.tablename = guarded_relation.name
        and policy.policyname = 'native account beta availability'
        and policy.permissive = 'RESTRICTIVE'
        and policy.cmd = 'ALL'
        and policy.roles = array['authenticated']::name[]
        and coalesce(policy.qual, '') like
          '%native_account_beta_request_allowed%'
        and coalesce(policy.with_check, '') like
          '%native_account_beta_request_allowed%'
    )
  ) or exists (
    select guarded_relation.name
    from pg_catalog.unnest(guarded_relations)
      as guarded_relation(name)
    where not exists (
      select 1
      from pg_catalog.pg_trigger as trigger
      join pg_catalog.pg_proc as procedure
        on procedure.oid = trigger.tgfoid
      where trigger.tgrelid = pg_catalog.to_regclass(
          'public.' || guarded_relation.name
        )
        and trigger.tgname = 'enforce_native_account_beta_availability'
        and procedure.proname = 'enforce_native_account_beta_availability'
        and not trigger.tgisinternal
        and trigger.tgenabled <> 'D'
    )
  ) then
    raise exception 'native account relation boundary is incomplete';
  end if;

  if pg_catalog.to_regprocedure(
       'public.delete_user_sync_rows_internal(uuid,bigint,uuid,jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.purge_user_data_internal(uuid,bigint,uuid)'
     ) is null
     or coalesce(
       (public.account_deletion_contract()->>'ready')::boolean,
       false
     ) is not true
     or coalesce(
       (public.profile_avatar_contract()->>'ok')::boolean,
       false
     ) is not true
     or coalesce(
       (public.guided_progress_sync_contract()->>'ok')::boolean,
       false
     ) is not true then
    raise exception 'native account post-migration contract failed';
  end if;
end;
$gate$;
