-- Persist one concurrency generation outside the purgeable journey tables.
create table if not exists public.user_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation bigint not null default 0 check (generation >= 0),
  request_history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  check (
    pg_catalog.jsonb_typeof(request_history) = 'array'
    and pg_catalog.jsonb_array_length(request_history) <= 32
  )
);

alter table public.user_sync_state enable row level security;
drop policy if exists "own sync state: select" on public.user_sync_state;
create policy "own sync state: select"
  on public.user_sync_state for select to authenticated
  using (auth.uid() = user_id);

revoke all privileges on table public.user_sync_state
  from public, anon, authenticated;
grant select (generation, updated_at) on table public.user_sync_state
  to authenticated;
grant all privileges on table public.user_sync_state to service_role;

-- Backfill current accounts before generation enforcement is installed.
insert into public.user_sync_state (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- New Auth users receive both retained sync state and a blank profile scaffold.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.user_sync_state (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'friend')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

revoke execute on function public.handle_new_user()
  from public, anon, authenticated, service_role;

-- Validate the session identity and lock its retained generation for a wrapper.
create or replace function public.assert_user_sync_context(
  p_expected_user_id uuid,
  p_expected_generation bigint,
  p_for_update boolean default false
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  current_generation bigint;
begin
  if uid is null or p_expected_user_id is null or uid <> p_expected_user_id then
    raise exception 'account sync: authenticated user changed'
      using errcode = '42501';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception 'account sync: invalid generation'
      using errcode = '22023';
  end if;

  if p_for_update then
    select generation into current_generation
    from public.user_sync_state
    where user_id = uid
    for update;
  else
    select generation into current_generation
    from public.user_sync_state
    where user_id = uid
    for share;
  end if;

  if current_generation is null then
    raise exception 'account sync: generation unavailable'
      using errcode = '40001';
  end if;
  if current_generation <> p_expected_generation then
    raise exception 'account sync: stale generation'
      using errcode = '40001';
  end if;
  return current_generation;
end;
$function$;

revoke execute on function public.assert_user_sync_context(uuid, bigint, boolean)
  from public, anon, authenticated, service_role;

-- Read the retained generation only after matching the captured account id.
create or replace function public.account_sync_generation(
  p_expected_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  live_generation bigint;
begin
  if uid is null or p_expected_user_id is null or uid <> p_expected_user_id then
    raise exception 'account sync: authenticated user changed'
      using errcode = '42501';
  end if;

  select generation into live_generation
  from public.user_sync_state
  where user_id = uid;
  if live_generation is null then
    raise exception 'account sync: generation unavailable'
      using errcode = '40001';
  end if;

  return pg_catalog.jsonb_build_object('generation', live_generation);
end;
$function$;

revoke execute on function public.account_sync_generation(uuid)
  from public, anon;
grant execute on function public.account_sync_generation(uuid)
  to authenticated;

-- Direct writes use request headers; guarded wrappers use transaction GUCs.
create or replace function public.enforce_user_sync_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  owner_id uuid;
  uid uuid := auth.uid();
  live_generation bigint;
  expected_user_text text;
  expected_generation_text text;
  expected_user uuid;
  expected_generation bigint;
  headers_text text;
  headers jsonb := '{}'::jsonb;
begin
  if auth.role() = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'profiles' then
    owner_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    owner_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  end if;

  select generation into live_generation
  from public.user_sync_state
  where user_id = owner_id
  for share;
  if live_generation is null then
    raise exception 'account sync: generation unavailable'
      using errcode = '40001';
  end if;

  expected_user_text := nullif(
    current_setting('biblequest.sync_expected_user', true),
    ''
  );
  expected_generation_text := nullif(
    current_setting('biblequest.sync_generation', true),
    ''
  );
  headers_text := nullif(current_setting('request.headers', true), '');
  if headers_text is not null then
    headers := headers_text::jsonb;
  end if;
  expected_user_text := coalesce(
    expected_user_text,
    nullif(headers->>'x-biblequest-expected-user', '')
  );
  expected_generation_text := coalesce(
    expected_generation_text,
    nullif(headers->>'x-biblequest-sync-generation', '')
  );

  -- Generation zero is the bounded compatibility window for cached clients.
  if live_generation = 0
     and expected_user_text is null
     and expected_generation_text is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  expected_user := expected_user_text::uuid;
  expected_generation := expected_generation_text::bigint;
  if uid is null
     or expected_user is null
     or expected_user <> uid
     or owner_id <> uid then
    raise exception 'account sync: authenticated user changed'
      using errcode = '42501';
  end if;
  if expected_generation is null or expected_generation <> live_generation then
    raise exception 'account sync: stale generation'
      using errcode = '40001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke execute on function public.enforce_user_sync_generation()
  from public, anon, authenticated, service_role;

-- Cover every table behind the fourteen logical account-sync fields.
drop trigger if exists enforce_user_sync_generation on public.profiles;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.profiles
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.user_settings;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.user_settings
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.notification_preferences;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.notification_preferences
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.user_daily_quests;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.user_daily_quests
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.user_daily_quest_days;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.user_daily_quest_days
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.user_quests;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.user_quests
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.quest_completions;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.quest_completions
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.prayers;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.prayers
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.reflections;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.reflections
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.journey_events;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.journey_events
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.growth_events;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.growth_events
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.user_milestones;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.user_milestones
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.verse_bookmarks;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.verse_bookmarks
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.reading_progress;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.reading_progress
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.chapters_read;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.chapters_read
  for each row execute function public.enforce_user_sync_generation();
drop trigger if exists enforce_user_sync_generation on public.user_recent_verses;
create trigger enforce_user_sync_generation
  before insert or update or delete on public.user_recent_verses
  for each row execute function public.enforce_user_sync_generation();

-- Destructive sync operations must use the generation-bumping RPC below.
revoke delete on table
  public.prayers,
  public.reflections,
  public.verse_bookmarks,
  public.user_quests,
  public.user_recent_verses
from authenticated;

-- Two additional mutable resources now use conditional server-side updates.
revoke update on table public.user_quests, public.reading_progress
from authenticated;

-- Preserve reviewed implementations as non-callable invoker-only workers.
alter function public.replace_user_daily_quests(date, bigint, uuid, jsonb)
  rename to replace_user_daily_quests_internal;
alter function public.replace_user_daily_quests_internal(date, bigint, uuid, jsonb)
  security invoker;
revoke execute on function public.replace_user_daily_quests_internal(date, bigint, uuid, jsonb)
  from public, anon, authenticated, service_role;

alter function public.upsert_mutable_account_rows(text, jsonb)
  rename to upsert_mutable_account_rows_internal;
alter function public.upsert_mutable_account_rows_internal(text, jsonb)
  security invoker;
revoke execute on function public.upsert_mutable_account_rows_internal(text, jsonb)
  from public, anon, authenticated, service_role;

alter function public.purge_user_data()
  rename to purge_user_data_internal;
alter function public.purge_user_data_internal() security invoker;
revoke execute on function public.purge_user_data_internal()
  from public, anon, authenticated, service_role;

-- Bind daily replacement to the captured user and retained generation.
create or replace function public.replace_user_daily_quests(
  p_expected_user_id uuid,
  p_expected_generation bigint,
  p_assigned_date date,
  p_expected_revision bigint,
  p_request_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  live_generation bigint;
  response jsonb;
begin
  live_generation := public.assert_user_sync_context(
    p_expected_user_id,
    p_expected_generation,
    false
  );
  perform pg_catalog.set_config(
    'biblequest.sync_expected_user',
    p_expected_user_id::text,
    true
  );
  perform pg_catalog.set_config(
    'biblequest.sync_generation',
    live_generation::text,
    true
  );
  response := public.replace_user_daily_quests_internal(
    p_assigned_date,
    p_expected_revision,
    p_request_id,
    p_rows
  );
  return response || pg_catalog.jsonb_build_object(
    'generation', live_generation
  );
end;
$function$;

revoke execute on function public.replace_user_daily_quests(uuid, bigint, date, bigint, uuid, jsonb)
  from public, anon;
grant execute on function public.replace_user_daily_quests(uuid, bigint, date, bigint, uuid, jsonb)
  to authenticated;

-- Add generation binding, blank-profile claim, shelf, and reading guards.
create or replace function public.upsert_mutable_account_rows(
  p_expected_user_id uuid,
  p_expected_generation bigint,
  p_resource text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  live_generation bigint;
  input_count integer;
  applied_count integer := 0;
  response jsonb;
  profile_input record;
begin
  live_generation := public.assert_user_sync_context(
    p_expected_user_id,
    p_expected_generation,
    false
  );
  perform pg_catalog.set_config(
    'biblequest.sync_expected_user',
    p_expected_user_id::text,
    true
  );
  perform pg_catalog.set_config(
    'biblequest.sync_generation',
    live_generation::text,
    true
  );

  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'upsert_mutable_account_rows: rows must be an array'
      using errcode = '22023';
  end if;
  input_count := pg_catalog.jsonb_array_length(p_rows);
  if input_count > 200 then
    raise exception 'upsert_mutable_account_rows: too many rows'
      using errcode = '22023';
  end if;

  if p_resource = 'user_quests' then
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_rows) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'object'
         or exists (
           select 1 from pg_catalog.jsonb_object_keys(item.value) as key(name)
           where key.name not in (
             'quest_slug', 'status', 'steps_done', 'times_completed',
             'added_at', 'started_at', 'paused_at', 'completed_at',
             'archived_at', 'last_activity_at'
           )
         )
    ) then
      raise exception 'upsert_mutable_account_rows: invalid user quest rows'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        quest_slug text, status text, steps_done text[], times_completed integer,
        added_at timestamptz, started_at timestamptz, paused_at timestamptz,
        completed_at timestamptz, archived_at timestamptz,
        last_activity_at timestamptz
      )
      where nullif(pg_catalog.btrim(row.quest_slug), '') is null
         or row.status is null
         or row.steps_done is null
         or row.times_completed is null
         or row.times_completed < 0
         or row.added_at is null
         or row.last_activity_at is null
    ) then
      raise exception 'upsert_mutable_account_rows: invalid user quest values'
        using errcode = '22023';
    end if;
    if exists (
      select row.quest_slug
      from pg_catalog.jsonb_to_recordset(p_rows) as row(quest_slug text)
      group by row.quest_slug having pg_catalog.count(*) > 1
    ) then
      raise exception 'upsert_mutable_account_rows: duplicate user quest'
        using errcode = '23505';
    end if;

    with input as (
      select * from pg_catalog.jsonb_to_recordset(p_rows) as row(
        quest_slug text, status text, steps_done text[], times_completed integer,
        added_at timestamptz, started_at timestamptz, paused_at timestamptz,
        completed_at timestamptz, archived_at timestamptz,
        last_activity_at timestamptz
      )
    ), written as (
      insert into public.user_quests as current_row (
        user_id, quest_slug, status, steps_done, times_completed, added_at,
        started_at, paused_at, completed_at, archived_at, last_activity_at
      )
      select uid, quest_slug, status, steps_done, times_completed, added_at,
        started_at, paused_at, completed_at, archived_at, last_activity_at
      from input
      on conflict (user_id, quest_slug) do update set
        status = excluded.status,
        steps_done = excluded.steps_done,
        times_completed = excluded.times_completed,
        added_at = excluded.added_at,
        started_at = excluded.started_at,
        paused_at = excluded.paused_at,
        completed_at = excluded.completed_at,
        archived_at = excluded.archived_at,
        last_activity_at = excluded.last_activity_at
      where excluded.last_activity_at >= current_row.last_activity_at
      returning 1
    )
    select pg_catalog.count(*)::integer into applied_count from written;
    return pg_catalog.jsonb_build_object(
      'applied', applied_count,
      'stale', input_count - applied_count,
      'generation', live_generation
    );
  elsif p_resource = 'reading_progress' then
    if input_count > 1 or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_rows) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'object'
         or exists (
           select 1 from pg_catalog.jsonb_object_keys(item.value) as key(name)
           where key.name not in ('book_slug', 'book_name', 'chapter', 'updated_at')
         )
    ) then
      raise exception 'upsert_mutable_account_rows: invalid reading rows'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        book_slug text, book_name text, chapter integer, updated_at timestamptz
      )
      where nullif(pg_catalog.btrim(row.book_slug), '') is null
         or nullif(pg_catalog.btrim(row.book_name), '') is null
         or row.chapter is null or row.chapter < 1 or row.updated_at is null
    ) then
      raise exception 'upsert_mutable_account_rows: invalid reading values'
        using errcode = '22023';
    end if;

    with input as (
      select * from pg_catalog.jsonb_to_recordset(p_rows) as row(
        book_slug text, book_name text, chapter integer, updated_at timestamptz
      )
    ), written as (
      insert into public.reading_progress as current_row (
        user_id, book_slug, book_name, chapter, updated_at
      )
      select uid, book_slug, book_name, chapter, updated_at from input
      on conflict (user_id) do update set
        book_slug = excluded.book_slug,
        book_name = excluded.book_name,
        chapter = excluded.chapter,
        updated_at = excluded.updated_at
      where excluded.updated_at >= current_row.updated_at
      returning 1
    )
    select pg_catalog.count(*)::integer into applied_count from written;
    return pg_catalog.jsonb_build_object(
      'applied', applied_count,
      'stale', input_count - applied_count,
      'generation', live_generation
    );
  elsif p_resource not in (
    'profiles', 'user_settings', 'notification_preferences',
    'prayers', 'reflections'
  ) then
    raise exception 'upsert_mutable_account_rows: invalid resource'
      using errcode = '22023';
  end if;

  response := public.upsert_mutable_account_rows_internal(p_resource, p_rows);

  -- An onboarded guest may replace only an untouched signup scaffold.
  if p_resource = 'profiles'
     and response->>'applied' = '0'
     and response->>'stale' = '1'
     and input_count = 1 then
    select * into profile_input
    from pg_catalog.jsonb_to_record(p_rows->0) as row(
      display_name text, tradition text, primary_goal text, calling text,
      daily_rhythm text, quest_style text, onboarding_completed boolean,
      created_at timestamptz, updated_at timestamptz
    );
    if profile_input.onboarding_completed is true then
      update public.profiles
      set display_name = profile_input.display_name,
          tradition = profile_input.tradition,
          primary_goal = profile_input.primary_goal,
          calling = profile_input.calling,
          daily_rhythm = profile_input.daily_rhythm,
          quest_style = profile_input.quest_style,
          onboarding_completed = true,
          updated_at = profile_input.updated_at
      where id = uid
        and onboarding_completed = false
        and faith_provider_id is null
        and tradition is null
        and primary_goal is null
        and calling is null
        and daily_rhythm is null
        and quest_style is null;
      get diagnostics applied_count = row_count;
      if applied_count = 1 then
        response := pg_catalog.jsonb_build_object('applied', 1, 'stale', 0);
      end if;
    end if;
  end if;

  return response || pg_catalog.jsonb_build_object(
    'generation', live_generation
  );
end;
$function$;

revoke execute on function public.upsert_mutable_account_rows(uuid, bigint, text, jsonb)
  from public, anon;
grant execute on function public.upsert_mutable_account_rows(uuid, bigint, text, jsonb)
  to authenticated;

-- Delete bounded tombstones atomically and advance the retained generation.
create or replace function public.delete_user_sync_rows(
  p_expected_user_id uuid,
  p_expected_generation bigint,
  p_request_id uuid,
  p_deletions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  current_generation bigint;
  new_generation bigint;
  history jsonb;
  prior_hash text;
  prior_generation bigint;
  request_hash text;
  deleted_count integer := 0;
  current_count integer;
begin
  if uid is null or p_expected_user_id is null or uid <> p_expected_user_id then
    raise exception 'account sync: authenticated user changed'
      using errcode = '42501';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception 'account sync: invalid generation'
      using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'delete_user_sync_rows: request id required'
      using errcode = '22023';
  end if;
  if p_deletions is null or pg_catalog.jsonb_typeof(p_deletions) <> 'array'
     or pg_catalog.jsonb_array_length(p_deletions) = 0
     or pg_catalog.jsonb_array_length(p_deletions) > 200 then
    raise exception 'delete_user_sync_rows: invalid deletions'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_deletions) as item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'object'
       or item.value->>'resource' not in (
         'prayers', 'reflections', 'bookmarks', 'user_quests', 'recent_verses'
       )
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(item.value) as key(name)
         where key.name not in (
           'resource', 'id', 'book_slug', 'chapter', 'verse',
           'translation_key', 'quest_slug', 'verse_start', 'verse_end'
         )
       )
  ) then
    raise exception 'delete_user_sync_rows: invalid deletion shape'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_deletions) as row(
      resource text, id uuid, book_slug text, chapter integer, verse integer,
      translation_key text, quest_slug text, verse_start integer, verse_end integer
    )
    where (resource in ('prayers', 'reflections') and id is null)
       or (resource = 'bookmarks' and (
         book_slug is null or chapter is null or verse is null
         or translation_key is null
       ))
       or (resource = 'user_quests' and quest_slug is null)
       or (resource = 'recent_verses' and (
         book_slug is null or chapter is null
         or verse_start is null or verse_end is null
       ))
  ) then
    raise exception 'delete_user_sync_rows: invalid deletion values'
      using errcode = '22023';
  end if;

  request_hash := pg_catalog.encode(
    extensions.digest(p_deletions::text, 'sha256'),
    'hex'
  );
  select generation, request_history
  into current_generation, history
  from public.user_sync_state
  where user_id = uid
  for update;
  if current_generation is null then
    raise exception 'account sync: generation unavailable'
      using errcode = '40001';
  end if;

  select item.value->>'hash', (item.value->>'generation')::bigint
  into prior_hash, prior_generation
  from pg_catalog.jsonb_array_elements(history) as item(value)
  where item.value->>'id' = p_request_id::text
  limit 1;
  if prior_hash is not null then
    if prior_hash <> request_hash then
      raise exception 'delete_user_sync_rows: request id reused'
        using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
      'deleted', 0, 'generation', prior_generation, 'duplicate', true
    );
  end if;
  if current_generation <> p_expected_generation then
    raise exception 'account sync: stale generation'
      using errcode = '40001';
  end if;

  perform pg_catalog.set_config('biblequest.sync_expected_user', uid::text, true);
  perform pg_catalog.set_config(
    'biblequest.sync_generation', current_generation::text, true
  );

  delete from public.prayers
  where user_id = uid and id in (
    select row.id
    from pg_catalog.jsonb_to_recordset(p_deletions) as row(resource text, id uuid)
    where row.resource = 'prayers'
  );
  get diagnostics current_count = row_count;
  deleted_count := deleted_count + current_count;
  delete from public.reflections
  where user_id = uid and id in (
    select row.id
    from pg_catalog.jsonb_to_recordset(p_deletions) as row(resource text, id uuid)
    where row.resource = 'reflections'
  );
  get diagnostics current_count = row_count;
  deleted_count := deleted_count + current_count;
  delete from public.verse_bookmarks as bookmark
  using pg_catalog.jsonb_to_recordset(p_deletions) as row(
    resource text, book_slug text, chapter integer, verse integer,
    translation_key text
  )
  where row.resource = 'bookmarks'
    and bookmark.user_id = uid
    and bookmark.book_slug = row.book_slug
    and bookmark.chapter = row.chapter
    and bookmark.verse = row.verse
    and bookmark.translation_key = row.translation_key;
  get diagnostics current_count = row_count;
  deleted_count := deleted_count + current_count;
  delete from public.user_quests as quest
  using pg_catalog.jsonb_to_recordset(p_deletions) as row(
    resource text, quest_slug text
  )
  where row.resource = 'user_quests'
    and quest.user_id = uid
    and quest.quest_slug = row.quest_slug;
  get diagnostics current_count = row_count;
  deleted_count := deleted_count + current_count;
  delete from public.user_recent_verses as verse
  using pg_catalog.jsonb_to_recordset(p_deletions) as row(
    resource text, book_slug text, chapter integer,
    verse_start integer, verse_end integer
  )
  where row.resource = 'recent_verses'
    and verse.user_id = uid
    and verse.book_slug = row.book_slug
    and verse.chapter = row.chapter
    and verse.verse_start = row.verse_start
    and verse.verse_end = row.verse_end;
  get diagnostics current_count = row_count;
  deleted_count := deleted_count + current_count;

  new_generation := current_generation + 1;
  update public.user_sync_state
  set generation = new_generation,
      request_history = (
        select coalesce(
          pg_catalog.jsonb_agg(entry.value order by entry.position),
          '[]'::jsonb
        )
        from pg_catalog.jsonb_array_elements(
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'id', p_request_id,
            'hash', request_hash,
            'generation', new_generation
          )) || history
        ) with ordinality as entry(value, position)
        where entry.position <= 32
      ),
      updated_at = pg_catalog.now()
  where user_id = uid;

  return pg_catalog.jsonb_build_object(
    'deleted', deleted_count,
    'generation', new_generation,
    'duplicate', false
  );
end;
$function$;

revoke execute on function public.delete_user_sync_rows(uuid, bigint, uuid, jsonb)
  from public, anon;
grant execute on function public.delete_user_sync_rows(uuid, bigint, uuid, jsonb)
  to authenticated;

-- Purge all journey rows, retain sync state, and advance generation once.
create or replace function public.purge_user_data(
  p_expected_user_id uuid,
  p_expected_generation bigint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  current_generation bigint;
  new_generation bigint;
  history jsonb;
  prior_hash text;
  prior_generation bigint;
  request_hash text := pg_catalog.md5('biblequest-purge-v3');
begin
  if uid is null or p_expected_user_id is null or uid <> p_expected_user_id then
    raise exception 'account sync: authenticated user changed'
      using errcode = '42501';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception 'account sync: invalid generation'
      using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'purge_user_data: request id required'
      using errcode = '22023';
  end if;
  select generation, request_history
  into current_generation, history
  from public.user_sync_state
  where user_id = uid
  for update;
  if current_generation is null then
    raise exception 'account sync: generation unavailable'
      using errcode = '40001';
  end if;
  select item.value->>'hash', (item.value->>'generation')::bigint
  into prior_hash, prior_generation
  from pg_catalog.jsonb_array_elements(history) as item(value)
  where item.value->>'id' = p_request_id::text
  limit 1;
  if prior_hash is not null then
    if prior_hash <> request_hash then
      raise exception 'purge_user_data: request id reused'
        using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
      'generation', prior_generation,
      'duplicate', true
    );
  end if;
  if current_generation <> p_expected_generation then
    raise exception 'account sync: stale generation'
      using errcode = '40001';
  end if;

  perform pg_catalog.set_config('biblequest.sync_expected_user', uid::text, true);
  perform pg_catalog.set_config(
    'biblequest.sync_generation', current_generation::text, true
  );
  perform public.purge_user_data_internal();

  new_generation := current_generation + 1;
  update public.user_sync_state
  set generation = new_generation,
      request_history = (
        select coalesce(
          pg_catalog.jsonb_agg(entry.value order by entry.position),
          '[]'::jsonb
        )
        from pg_catalog.jsonb_array_elements(
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'id', p_request_id,
            'hash', request_hash,
            'generation', new_generation
          )) || history
        ) with ordinality as entry(value, position)
        where entry.position <= 32
      ),
      updated_at = pg_catalog.now()
  where user_id = uid;

  return pg_catalog.jsonb_build_object(
    'generation', new_generation,
    'duplicate', false
  );
end;
$function$;

revoke execute on function public.purge_user_data(uuid, bigint, uuid)
  from public, anon;
grant execute on function public.purge_user_data(uuid, bigint, uuid)
  to authenticated;

-- Keep the exact v1 readiness response truthful after replacing the CAS entry
-- point with the expected-user and generation-bound six-argument wrapper.
create or replace function public.daily_quest_sync_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with revision_table as (
  select relation.oid, relation.relrowsecurity
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'user_daily_quest_days'
    and relation.relkind = 'r'
), cas_function as (
  select procedure.oid, procedure.prosecdef, procedure.proconfig
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.replace_user_daily_quests(uuid,bigint,date,bigint,uuid,jsonb)'
  )
), trigger_functions as (
  select pg_catalog.count(*) = 2 as hardened
  from pg_catalog.pg_proc as procedure
  where procedure.oid in (
      pg_catalog.to_regprocedure(
        'public.bump_daily_quest_revision_for_legacy_write()'
      ),
      pg_catalog.to_regprocedure(
        'public.preserve_daily_quest_completion_for_legacy_write()'
      )
    )
    and procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and not pg_catalog.has_function_privilege(
      'anon', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
), legacy_triggers as (
  select pg_catalog.count(*) = 2 as enabled
  from pg_catalog.pg_trigger as trigger
  join pg_catalog.pg_proc as procedure
    on procedure.oid = trigger.tgfoid
  where trigger.tgrelid = pg_catalog.to_regclass(
      'public.user_daily_quests'
    )
    and not trigger.tgisinternal
    and trigger.tgenabled <> 'D'
    and (
      (
        trigger.tgname = 'bump_daily_quest_revision_for_legacy_write'
        and procedure.proname = 'bump_daily_quest_revision_for_legacy_write'
      )
      or (
        trigger.tgname = 'preserve_daily_quest_completion_for_legacy_write'
        and procedure.proname = 'preserve_daily_quest_completion_for_legacy_write'
      )
    )
)
select pg_catalog.jsonb_build_object(
  'contract', 'biblequest_daily_quest_sync_v1',
  'ok',
    coalesce(
      (
        select revision_table.relrowsecurity
          and pg_catalog.has_column_privilege(
            'authenticated', revision_table.oid, 'assigned_date', 'SELECT'
          )
          and pg_catalog.has_column_privilege(
            'authenticated', revision_table.oid, 'revision', 'SELECT'
          )
          and not pg_catalog.has_column_privilege(
            'authenticated', revision_table.oid, 'user_id', 'SELECT'
          )
          and not pg_catalog.has_column_privilege(
            'authenticated', revision_table.oid, 'request_history', 'SELECT'
          )
          and not pg_catalog.has_table_privilege(
            'authenticated', revision_table.oid, 'INSERT'
          )
          and not pg_catalog.has_table_privilege(
            'authenticated', revision_table.oid, 'UPDATE'
          )
          and not pg_catalog.has_table_privilege(
            'authenticated', revision_table.oid, 'DELETE'
          )
          and not pg_catalog.has_table_privilege(
            'anon', revision_table.oid, 'SELECT'
          )
          and not pg_catalog.has_table_privilege(
            'anon', revision_table.oid, 'INSERT'
          )
          and not pg_catalog.has_table_privilege(
            'anon', revision_table.oid, 'UPDATE'
          )
          and not pg_catalog.has_table_privilege(
            'anon', revision_table.oid, 'DELETE'
          )
          and exists (
            select 1
            from pg_catalog.pg_policies as policy
            where policy.schemaname = 'public'
              and policy.tablename = 'user_daily_quest_days'
              and policy.cmd = 'SELECT'
              and policy.roles = array['authenticated']::name[]
              and policy.qual = '(auth.uid() = user_id)'
          )
        from revision_table
      ),
      false
    )
    and coalesce(
      (
        select cas_function.prosecdef
          and cas_function.proconfig = array['search_path=""']::text[]
          and pg_catalog.has_function_privilege(
            'authenticated', cas_function.oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'anon', cas_function.oid, 'EXECUTE'
          )
        from cas_function
      ),
      false
    )
    and coalesce((select hardened from trigger_functions), false)
    and coalesce((select enabled from legacy_triggers), false)
);
$function$;

revoke execute on function public.daily_quest_sync_contract() from public;
grant execute on function public.daily_quest_sync_contract()
  to anon, authenticated, service_role;

-- Keep the exact v2 readiness response while expanding its guarded update
-- boundary to user quests and reading progress.
create or replace function public.mutable_account_sync_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with guarded_function as (
  select
    procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon', procedure.oid, 'EXECUTE'
    ) as ok
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.upsert_mutable_account_rows(uuid,bigint,text,jsonb)'
  )
), mutable_tables(table_name) as (
  values
    ('profiles'),
    ('user_settings'),
    ('notification_preferences'),
    ('prayers'),
    ('reflections'),
    ('user_quests'),
    ('reading_progress')
), update_boundary as (
  select
    pg_catalog.count(*) = 7
    and pg_catalog.bool_and(
      not pg_catalog.has_table_privilege(
        'authenticated',
        pg_catalog.format('public.%I', table_name),
        'UPDATE'
      )
    )
    and not exists (
      select 1
      from information_schema.column_privileges as privilege
      where privilege.table_schema = 'public'
        and privilege.table_name in (
          'profiles',
          'user_settings',
          'notification_preferences',
          'prayers',
          'reflections',
          'user_quests',
          'reading_progress'
        )
        and privilege.grantee = 'authenticated'
        and privilege.privilege_type = 'UPDATE'
    ) as ok
  from mutable_tables
)
select pg_catalog.jsonb_build_object(
  'contract', 'biblequest_mutable_account_sync_v2',
  'ok', coalesce((select ok from guarded_function), false)
    and coalesce((select ok from update_boundary), false)
);
$function$;

revoke execute on function public.mutable_account_sync_contract() from public;
grant execute on function public.mutable_account_sync_contract()
  to anon, authenticated, service_role;

-- Publish one fixed, content-free posture for the complete v3 boundary.
create or replace function public.account_sync_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with sync_table as (
  select
    relation.relrowsecurity
    and pg_catalog.has_column_privilege(
      'authenticated', relation.oid, 'generation', 'SELECT'
    )
    and pg_catalog.has_column_privilege(
      'authenticated', relation.oid, 'updated_at', 'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated', relation.oid, 'user_id', 'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated', relation.oid, 'request_history', 'SELECT'
    )
    and not pg_catalog.has_table_privilege(
      'anon', relation.oid, 'SELECT'
    )
    and exists (
      select 1 from pg_catalog.pg_policies as policy
      where policy.schemaname = 'public'
        and policy.tablename = 'user_sync_state'
        and policy.cmd = 'SELECT'
        and policy.roles = array['authenticated']::name[]
        and policy.qual = '(auth.uid() = user_id)'
    ) as ok
  from pg_catalog.pg_class as relation
  where relation.oid = pg_catalog.to_regclass('public.user_sync_state')
), wrappers(signature) as (
  values
    ('public.account_sync_generation(uuid)'),
    ('public.replace_user_daily_quests(uuid,bigint,date,bigint,uuid,jsonb)'),
    ('public.upsert_mutable_account_rows(uuid,bigint,text,jsonb)'),
    ('public.delete_user_sync_rows(uuid,bigint,uuid,jsonb)'),
    ('public.purge_user_data(uuid,bigint,uuid)')
), hardened_wrappers as (
  select pg_catalog.count(*) = 5 as ok
  from wrappers
  join pg_catalog.pg_proc as procedure
    on procedure.oid = pg_catalog.to_regprocedure(wrappers.signature)
  where procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
), private_invokers(signature) as (
  values
    ('public.replace_user_daily_quests_internal(date,bigint,uuid,jsonb)'),
    ('public.upsert_mutable_account_rows_internal(text,jsonb)'),
    ('public.purge_user_data_internal()'),
    ('public.assert_user_sync_context(uuid,bigint,boolean)')
), hardened_private_invokers as (
  select pg_catalog.count(*) = 4 as ok
  from private_invokers
  join pg_catalog.pg_proc as procedure
    on procedure.oid = pg_catalog.to_regprocedure(private_invokers.signature)
  where not procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and not pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege(
      'service_role', procedure.oid, 'EXECUTE'
    )
), private_definers(signature) as (
  values
    ('public.enforce_user_sync_generation()'),
    ('public.handle_new_user()')
), hardened_private_definers as (
  select pg_catalog.count(*) = 2 as ok
  from private_definers
  join pg_catalog.pg_proc as procedure
    on procedure.oid = pg_catalog.to_regprocedure(private_definers.signature)
  where procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and not pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege(
      'service_role', procedure.oid, 'EXECUTE'
    )
), expected_generation_tables(table_name) as (
  values
    ('profiles'), ('user_settings'), ('notification_preferences'),
    ('user_daily_quests'), ('user_daily_quest_days'), ('user_quests'),
    ('quest_completions'), ('prayers'), ('reflections'), ('journey_events'),
    ('growth_events'), ('user_milestones'), ('verse_bookmarks'),
    ('reading_progress'), ('chapters_read'), ('user_recent_verses')
), generation_triggers as (
  select pg_catalog.count(trigger.oid) = 16 as ok
  from expected_generation_tables as expected
  join pg_catalog.pg_class as relation on relation.relname = expected.table_name
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace and namespace.nspname = 'public'
  join pg_catalog.pg_trigger as trigger on trigger.tgrelid = relation.oid
  join pg_catalog.pg_proc as procedure on procedure.oid = trigger.tgfoid
  where trigger.tgname = 'enforce_user_sync_generation'
    and not trigger.tgisinternal
    and trigger.tgenabled <> 'D'
    and procedure.proname = 'enforce_user_sync_generation'
), mutation_boundary as (
  select pg_catalog.bool_and(not pg_catalog.has_table_privilege(
      'authenticated', table_name, privilege
    ))
    and not exists (
      select 1 from information_schema.column_privileges as column_privilege
      where column_privilege.table_schema = 'public'
        and column_privilege.table_name in (
          'profiles', 'user_settings', 'notification_preferences',
          'prayers', 'reflections', 'user_quests', 'reading_progress'
        )
        and column_privilege.grantee = 'authenticated'
        and column_privilege.privilege_type = 'UPDATE'
    ) as ok
  from (values
    ('public.profiles', 'UPDATE'),
    ('public.user_settings', 'UPDATE'),
    ('public.notification_preferences', 'UPDATE'),
    ('public.prayers', 'UPDATE'),
    ('public.reflections', 'UPDATE'),
    ('public.user_quests', 'UPDATE'),
    ('public.reading_progress', 'UPDATE'),
    ('public.prayers', 'DELETE'),
    ('public.reflections', 'DELETE'),
    ('public.verse_bookmarks', 'DELETE'),
    ('public.user_quests', 'DELETE'),
    ('public.user_recent_verses', 'DELETE')
  ) as expected(table_name, privilege)
), retired_entry_points as (
  select
    pg_catalog.to_regprocedure(
      'public.replace_user_daily_quests(date,bigint,uuid,jsonb)'
    ) is null
    and pg_catalog.to_regprocedure(
      'public.upsert_mutable_account_rows(text,jsonb)'
    ) is null
    and pg_catalog.to_regprocedure('public.purge_user_data()') is null as ok
)
select pg_catalog.jsonb_build_object(
  'contract', 'biblequest_account_sync_v3',
  'ok',
    coalesce((select ok from sync_table), false)
    and coalesce((select ok from hardened_wrappers), false)
    and coalesce((select ok from hardened_private_invokers), false)
    and coalesce((select ok from hardened_private_definers), false)
    and coalesce((select ok from generation_triggers), false)
    and coalesce((select ok from mutation_boundary), false)
    and coalesce((select ok from retired_entry_points), false)
);
$function$;

revoke execute on function public.account_sync_contract() from public;
grant execute on function public.account_sync_contract()
  to anon, authenticated, service_role;
