-- Add monotonic, owner-only progress markers for guided Pilgrimage days.
-- Daily guides remain device-local; no Scripture, prayer, or journal text
-- enters this table.

create table if not exists public.user_guided_movements (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_key text not null,
  content_id text not null,
  movement_key text not null,
  occurred_at timestamptz not null,
  primary key (user_id, session_key, movement_key),
  constraint user_guided_movements_content_id_check check (
    content_id ~
      '^pilgrimage\.[a-z0-9]+([.-][a-z0-9]+)*\.v[1-9][0-9]*$'
  ),
  constraint user_guided_movements_session_key_check check (
    session_key = 'pilgrimage|' || content_id
    and pg_catalog.length(session_key) <= 180
  ),
  constraint user_guided_movements_movement_key_check check (
    movement_key in (
      'started', 'arrive', 'read', 'notice', 'reflect', 'respond', 'pray'
    )
  )
);

create index if not exists user_guided_movements_owner_time_idx
  on public.user_guided_movements (user_id, occurred_at, session_key);

alter table public.user_guided_movements enable row level security;
alter table public.user_guided_movements force row level security;

revoke all privileges on table public.user_guided_movements
  from public, anon, authenticated;
grant select, insert on table public.user_guided_movements to authenticated;
grant all privileges on table public.user_guided_movements to service_role;

drop policy if exists "own guided movements: select"
  on public.user_guided_movements;
create policy "own guided movements: select"
  on public.user_guided_movements for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own guided movements: insert"
  on public.user_guided_movements;
create policy "own guided movements: insert"
  on public.user_guided_movements for insert to authenticated
  with check (auth.uid() = user_id);

-- Bind direct append-only writes to the retained account generation.
drop trigger if exists enforce_user_sync_generation
  on public.user_guided_movements;
create trigger enforce_user_sync_generation
  before insert or delete on public.user_guided_movements
  for each row execute function public.enforce_user_sync_generation();

-- Apply the shared one-MiB defense-in-depth boundary.
drop trigger if exists enforce_user_owned_row_size
  on public.user_guided_movements;
create trigger enforce_user_owned_row_size
  before insert or update on public.user_guided_movements
  for each row execute function public.enforce_user_owned_row_size();

-- Extend both Clear Data and self-service account deletion through their
-- existing private invoker. The public generation-bound wrapper is unchanged.
create or replace function public.purge_user_data_internal()
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'purge_user_data: not authenticated';
  end if;

  perform pg_catalog.set_config('biblequest.daily_quest_purge', 'on', true);

  delete from public.user_guided_movements   where user_id = uid;
  delete from public.user_recent_verses      where user_id = uid;
  delete from public.user_quests             where user_id = uid;
  delete from public.user_daily_quests       where user_id = uid;
  delete from public.user_daily_quest_days   where user_id = uid;
  delete from public.quest_completions       where user_id = uid;
  delete from public.prayers                 where user_id = uid;
  delete from public.reflections             where user_id = uid;
  delete from public.verse_bookmarks         where user_id = uid;
  delete from public.reading_progress        where user_id = uid;
  delete from public.chapters_read           where user_id = uid;
  delete from public.journey_events          where user_id = uid;
  delete from public.growth_events           where user_id = uid;
  delete from public.user_milestones         where user_id = uid;
  delete from public.user_settings           where user_id = uid;
  delete from public.notification_preferences where user_id = uid;
  delete from public.profiles                where id = uid;
end;
$function$;

revoke all on function public.purge_user_data_internal()
  from public, anon, authenticated, service_role;

-- Publish only a fixed readiness identity and boolean. No owner, policy text,
-- identifiers, counts, or row data can leave this boundary.
create or replace function public.guided_progress_sync_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with relation as (
  select class.oid, class.relrowsecurity, class.relforcerowsecurity
  from pg_catalog.pg_class as class
  where class.oid = pg_catalog.to_regclass(
    'public.user_guided_movements'
  )
), policies as (
  select
    pg_catalog.count(*) = 2
    and pg_catalog.count(*) filter (
      where policy.cmd = 'SELECT'
        and policy.roles = array['authenticated']::name[]
        and policy.qual = '(auth.uid() = user_id)'
    ) = 1
    and pg_catalog.count(*) filter (
      where policy.cmd = 'INSERT'
        and policy.roles = array['authenticated']::name[]
        and policy.with_check = '(auth.uid() = user_id)'
    ) = 1 as ok
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename = 'user_guided_movements'
), triggers as (
  select
    pg_catalog.count(*) filter (
      where trigger.tgname = 'enforce_user_sync_generation'
        and procedure.proname = 'enforce_user_sync_generation'
    ) = 1
    and pg_catalog.count(*) filter (
      where trigger.tgname = 'enforce_user_owned_row_size'
        and procedure.proname = 'enforce_user_owned_row_size'
    ) = 1 as ok
  from pg_catalog.pg_trigger as trigger
  join pg_catalog.pg_proc as procedure on procedure.oid = trigger.tgfoid
  where trigger.tgrelid = pg_catalog.to_regclass(
    'public.user_guided_movements'
  )
    and not trigger.tgisinternal
    and trigger.tgenabled <> 'D'
), purge_boundary as (
  select
    not procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and procedure.prosrc like '%user_guided_movements%'
    and not pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'service_role', procedure.oid, 'EXECUTE'
    ) as ok
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.purge_user_data_internal()'
  )
)
select pg_catalog.jsonb_build_object(
  'contract', 'biblequest_guided_progress_sync_v1',
  'ok', coalesce((
    select relation.relrowsecurity
      and relation.relforcerowsecurity
      and pg_catalog.has_table_privilege(
        'authenticated', relation.oid, 'SELECT'
      )
      and pg_catalog.has_table_privilege(
        'authenticated', relation.oid, 'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', relation.oid, 'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', relation.oid, 'DELETE'
      )
      and not pg_catalog.has_table_privilege('anon', relation.oid, 'SELECT')
      and (select policies.ok from policies)
      and (select triggers.ok from triggers)
      and (select purge_boundary.ok from purge_boundary)
    from relation
  ), false)
);
$function$;

revoke execute on function public.guided_progress_sync_contract()
  from public;
grant execute on function public.guided_progress_sync_contract()
  to anon, authenticated;
