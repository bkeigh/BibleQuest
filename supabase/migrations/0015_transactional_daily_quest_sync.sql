-- Transactional, revision-guarded daily-quest replacement for multi-device sync.
-- Legacy table writes remain available during rollout and advance the revision.

begin;

create table if not exists public.user_daily_quest_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_date date not null,
  revision bigint not null default 0 check (revision >= 0),
  request_history jsonb not null default '[]'::jsonb
    check (jsonb_typeof(request_history) = 'array'),
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

-- Cached clients replace a day with direct DELETE + INSERT requests. Keep a
-- completed row in place and silently skip its duplicate re-insert so that
-- legacy retries remain compatible without exposing cross-owner existence.
create or replace function public.preserve_daily_quest_completion_for_legacy_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
begin
  if current_setting('biblequest.daily_quest_rpc', true) = 'on'
     or current_setting('biblequest.daily_quest_purge', true) = 'on'
     or uid is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('DELETE', 'UPDATE')
     and old.user_id = uid
     and old.status = 'completed' then
    return null;
  end if;

  if tg_op = 'INSERT' and new.user_id = uid and exists (
    select 1
    from public.user_daily_quests as existing
    where existing.user_id = new.user_id
      and existing.assigned_date = new.assigned_date
      and existing.quest_slug = new.quest_slug
      and existing.status = 'completed'
  ) then
    return null;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists preserve_daily_quest_completion_for_legacy_write
  on public.user_daily_quests;
create trigger preserve_daily_quest_completion_for_legacy_write
  before insert or update or delete on public.user_daily_quests
  for each row execute function public.preserve_daily_quest_completion_for_legacy_write();

revoke execute on function public.preserve_daily_quest_completion_for_legacy_write()
  from public, anon, authenticated;

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
  if current_setting('biblequest.daily_quest_rpc', true) = 'on'
     or current_setting('biblequest.daily_quest_purge', true) = 'on' then
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
  previous_request_hash text;
  request_hash text;
  request_history jsonb;
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

  select revision, user_daily_quest_days.request_history
  into current_revision, request_history
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

  select history.value->>'hash'
  into previous_request_hash
  from jsonb_array_elements(request_history) as history(value)
  where history.value->>'id' = p_request_id::text
  limit 1;

  if previous_request_hash is not null then
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
      request_history = (
        select coalesce(
          jsonb_agg(history.value order by history.position),
          '[]'::jsonb
        )
        from jsonb_array_elements(
          jsonb_build_array(
            jsonb_build_object('id', p_request_id, 'hash', request_hash)
          ) || public.user_daily_quest_days.request_history
        ) with ordinality as history(value, position)
        where history.position <= 32
      ),
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

  perform set_config('biblequest.daily_quest_purge', 'on', true);

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

-- Expose one content-free readiness bit that is derived from the live CAS,
-- RLS, grant, and cached-client trigger posture instead of a version label.
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
),
cas_function as (
  select procedure.oid, procedure.prosecdef, procedure.proconfig
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.replace_user_daily_quests(date,bigint,uuid,jsonb)'
  )
),
trigger_functions as (
  select count(*) = 2 as hardened
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
),
legacy_triggers as (
  select count(*) = 2 as enabled
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

revoke execute on function public.daily_quest_sync_contract()
  from public, anon, authenticated;
grant execute on function public.daily_quest_sync_contract()
  to anon, authenticated;

commit;
