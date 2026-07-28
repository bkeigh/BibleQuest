-- Close the last directly callable trigger helper and cap every synced row.
-- This is defense in depth behind API request limits and account ownership RLS.
create or replace function public.enforce_user_owned_row_size()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if pg_catalog.pg_column_size(new) > 1048576 then
    raise exception 'account sync row exceeds 1 MiB'
      using errcode = '22001';
  end if;
  return new;
end;
$function$;

revoke all on function public.enforce_user_owned_row_size()
  from public, anon, authenticated, service_role;

-- Install the same fail-closed cap on all sixteen generation-bound resources.
do $install$
declare
  table_name text;
begin
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
    execute pg_catalog.format(
      'drop trigger if exists enforce_user_owned_row_size on public.%I',
      table_name
    );
    execute pg_catalog.format(
      'create trigger enforce_user_owned_row_size ' ||
      'before insert or update on public.%I ' ||
      'for each row execute function public.enforce_user_owned_row_size()',
      table_name
    );
  end loop;
end;
$install$;

-- Trigger functions never need Data API EXECUTE privileges of their own.
revoke all on function public.ensure_journey_event_date_key()
  from public, anon, authenticated, service_role;
