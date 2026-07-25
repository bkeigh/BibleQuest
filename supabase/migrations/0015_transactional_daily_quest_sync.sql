-- Forward-only transactional daily-quest sync after authoritative migration 0014.
-- Provides revision-guarded replacement for multi-device sync.
-- Legacy table writes remain available during rollout and advance the revision.

begin;

create table if not exists public.user_daily_quest_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_date date not null,
  revision bigint not null default 0 check (revision >= 0),
  last_request_id uuid,
  last_request_hash text,
  updated_at timestamptz not null default now(),
  primary key (user_id, assigned_date)
);

-- Existing days start above the empty-day baseline so a new client must first
-- observe the deployed rows before it can replace them.
insert into public.user_daily_quest_days (
  user_id,
  assigned_date,
  revision
)
select user_id, assigned_date, 1
from public.user_daily_quests
group by user_id, assigned_date
on conflict (user_id, assigned_date) do nothing;

alter table public.user_daily_quest_days enable row level security;

drop policy if exists "own daily quest revisions: select"
  on public.user_daily_quest_days;
create policy "own daily quest revisions: select"
  on public.user_daily_quest_days for select to authenticated
  using (auth.uid() = user_id);

revoke all privileges on table public.user_daily_quest_days
  from public, anon, authenticated, service_role;
grant select (assigned_date, revision)
  on public.user_daily_quest_days to authenticated;
grant all privileges on table public.user_daily_quest_days to service_role;

-- Old cached clients still write the original table directly. Advancing the
-- opaque day revision makes those writes visible to compare-and-swap clients.
create or replace function public.bump_daily_quest_revision_for_legacy_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_uid uuid;
  old_day date;
  new_uid uuid;
  new_day date;
begin
  if current_setting('biblequest.daily_quest_rpc', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('DELETE', 'UPDATE') then
    old_uid := old.user_id;
    old_day := old.assigned_date;
    insert into public.user_daily_quest_days (
      user_id,
      assigned_date,
      revision,
      updated_at
    ) values (
      old_uid,
      old_day,
      1,
      now()
    )
    on conflict (user_id, assigned_date) do update
      set revision = public.user_daily_quest_days.revision + 1,
          last_request_id = null,
          last_request_hash = null,
          updated_at = now();
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_uid := new.user_id;
    new_day := new.assigned_date;
    if tg_op <> 'UPDATE' or (new_uid, new_day) is distinct from (old_uid, old_day) then
      insert into public.user_daily_quest_days (
        user_id,
        assigned_date,
        revision,
        updated_at
      ) values (
        new_uid,
        new_day,
        1,
        now()
      )
      on conflict (user_id, assigned_date) do update
        set revision = public.user_daily_quest_days.revision + 1,
            last_request_id = null,
            last_request_hash = null,
            updated_at = now();
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists bump_daily_quest_revision_for_legacy_write
  on public.user_daily_quests;
create trigger bump_daily_quest_revision_for_legacy_write
  after insert or update or delete on public.user_daily_quests
  for each row execute function public.bump_daily_quest_revision_for_legacy_write();

revoke execute on function public.bump_daily_quest_revision_for_legacy_write()
  from public, anon, authenticated;

-- Replace one day atomically when the caller still owns the observed revision.
-- The authenticated identity is derived server-side; no service key or user id
-- is accepted from the browser.
create or replace function public.replace_user_daily_quests(
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
  uid uuid := auth.uid();
  current_revision bigint;
  previous_request_id uuid;
  previous_request_hash text;
  request_hash text;
  canonical_rows jsonb;
begin
  if uid is null then
    raise exception 'replace_user_daily_quests: not authenticated'
      using errcode = '42501';
  end if;
  if p_assigned_date is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'replace_user_daily_quests: invalid revision request'
      using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'replace_user_daily_quests: request id required'
      using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'replace_user_daily_quests: rows must be an array'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'replace_user_daily_quests: too many rows'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(value)
    where jsonb_typeof(item.value) <> 'object'
       or exists (
         select 1
         from jsonb_object_keys(item.value) as key(name)
         where key.name not in (
           'quest_slug',
           'status',
           'rerolls',
           'started_at',
           'completed_at',
           'picked_at',
           'expires_at'
         )
       )
  ) then
    raise exception 'replace_user_daily_quests: invalid row shape'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row(
      quest_slug text,
      status text,
      rerolls integer,
      started_at timestamptz,
      completed_at timestamptz,
      picked_at timestamptz,
      expires_at timestamptz
    )
    where nullif(btrim(row.quest_slug), '') is null
       or length(row.quest_slug) > 200
       or row.status is null
       or row.status not in ('assigned', 'started', 'completed', 'released')
       or row.rerolls is null
       or row.rerolls < 0
       or row.picked_at is null
       or row.expires_at is null
       or row.expires_at <= row.picked_at
       or (row.status = 'completed' and row.completed_at is null)
  ) then
    raise exception 'replace_user_daily_quests: invalid row values'
      using errcode = '22023';
  end if;
  if exists (
    select row.quest_slug
    from jsonb_to_recordset(p_rows) as row(quest_slug text)
    group by row.quest_slug
    having count(*) > 1
  ) then
    raise exception 'replace_user_daily_quests: duplicate quest slug'
      using errcode = '23505';
  end if;

  request_hash := encode(
    extensions.digest(
      (jsonb_build_object('assigned_date', p_assigned_date, 'rows', p_rows))::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.user_daily_quest_days (
    user_id,
    assigned_date,
    revision
  ) values (
    uid,
    p_assigned_date,
    0
  )
  on conflict (user_id, assigned_date) do nothing;

  select revision, last_request_id, last_request_hash
  into current_revision, previous_request_id, previous_request_hash
  from public.user_daily_quest_days
  where user_id = uid
    and assigned_date = p_assigned_date
  for update;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'quest_slug', quest.quest_slug,
        'status', quest.status,
        'rerolls', quest.rerolls,
        'started_at', quest.started_at,
        'completed_at', quest.completed_at,
        'picked_at', quest.picked_at,
        'expires_at', quest.expires_at
      ) order by quest.quest_slug
    ),
    '[]'::jsonb
  )
  into canonical_rows
  from public.user_daily_quests as quest
  where quest.user_id = uid
    and quest.assigned_date = p_assigned_date;

  if previous_request_id = p_request_id then
    if previous_request_hash is distinct from request_hash then
      raise exception 'replace_user_daily_quests: request id reused'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'status', 'applied',
      'revision', current_revision,
      'duplicate', true,
      'rows', canonical_rows
    );
  end if;

  if current_revision <> p_expected_revision then
    return jsonb_build_object(
      'status', 'conflict',
      'revision', current_revision,
      'duplicate', false,
      'rows', canonical_rows
    );
  end if;

  perform set_config('biblequest.daily_quest_rpc', 'on', true);

  -- Completed rows are durable history. A current device may replace or
  -- remove unfinished picks, but cannot delete or downgrade a completion.
  delete from public.user_daily_quests
  where user_id = uid
    and assigned_date = p_assigned_date
    and status <> 'completed';

  insert into public.user_daily_quests (
    user_id,
    quest_slug,
    assigned_date,
    status,
    rerolls,
    started_at,
    completed_at,
    picked_at,
    expires_at
  )
  select
    uid,
    row.quest_slug,
    p_assigned_date,
    row.status,
    row.rerolls,
    row.started_at,
    row.completed_at,
    row.picked_at,
    row.expires_at
  from jsonb_to_recordset(p_rows) as row(
    quest_slug text,
    status text,
    rerolls integer,
    started_at timestamptz,
    completed_at timestamptz,
    picked_at timestamptz,
    expires_at timestamptz
  )
  on conflict (user_id, assigned_date, quest_slug) do nothing;

  update public.user_daily_quest_days
  set revision = current_revision + 1,
      last_request_id = p_request_id,
      last_request_hash = request_hash,
      updated_at = now()
  where user_id = uid
    and assigned_date = p_assigned_date;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'quest_slug', quest.quest_slug,
        'status', quest.status,
        'rerolls', quest.rerolls,
        'started_at', quest.started_at,
        'completed_at', quest.completed_at,
        'picked_at', quest.picked_at,
        'expires_at', quest.expires_at
      ) order by quest.quest_slug
    ),
    '[]'::jsonb
  )
  into canonical_rows
  from public.user_daily_quests as quest
  where quest.user_id = uid
    and quest.assigned_date = p_assigned_date;

  return jsonb_build_object(
    'status', 'applied',
    'revision', current_revision + 1,
    'duplicate', false,
    'rows', canonical_rows
  );
end;
$function$;

revoke execute on function public.replace_user_daily_quests(date, bigint, uuid, jsonb)
  from public, anon;
grant execute on function public.replace_user_daily_quests(date, bigint, uuid, jsonb)
  to authenticated;

-- Clear My Data must remove empty-day revisions as well as visible quest rows.
create or replace function public.purge_user_data()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'purge_user_data: not authenticated';
  end if;

  delete from public.user_recent_verses       where user_id = uid;
  delete from public.user_quests              where user_id = uid;
  delete from public.user_daily_quests        where user_id = uid;
  delete from public.user_daily_quest_days    where user_id = uid;
  delete from public.quest_completions        where user_id = uid;
  delete from public.prayers                  where user_id = uid;
  delete from public.reflections              where user_id = uid;
  delete from public.verse_bookmarks          where user_id = uid;
  delete from public.reading_progress         where user_id = uid;
  delete from public.chapters_read            where user_id = uid;
  delete from public.journey_events           where user_id = uid;
  delete from public.growth_events            where user_id = uid;
  delete from public.user_milestones          where user_id = uid;
  delete from public.user_settings            where user_id = uid;
  delete from public.notification_preferences where user_id = uid;
  delete from public.profiles                 where id = uid;
end;
$function$;

revoke execute on function public.purge_user_data() from public;
revoke execute on function public.purge_user_data() from anon;
grant execute on function public.purge_user_data() to authenticated;

commit;
