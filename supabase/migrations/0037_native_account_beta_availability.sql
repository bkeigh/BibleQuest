-- Keep the native account beta off until its staging schema and device matrix
-- have been reviewed. The web account posture does not consult this flag.
insert into public.feature_flags (key, description, enabled)
values (
  'native_account_beta',
  'Native email-code account beta availability',
  false
)
on conflict (key) do update
set description = excluded.description,
    enabled = false;

-- Return only the fixed availability contract needed before native auth starts.
create or replace function public.native_account_beta_availability()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
select pg_catalog.jsonb_build_object(
  'contract', 'biblequest_native_account_beta_v1',
  'available', exists (
    select 1
    from public.feature_flags
    where key = 'native_account_beta' and enabled
  )
);
$function$;

revoke execute on function public.native_account_beta_availability()
  from public;
grant execute on function public.native_account_beta_availability()
  to anon, authenticated;

-- Allow ordinary web and operator requests through while requiring the exact
-- native beta header to agree with the remotely controlled flag. A verified
-- deletion gets one transaction-local, user-bound exception so disabling the
-- beta cannot strand an account that the current bearer asks us to erase.
create or replace function public.native_account_beta_request_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  headers jsonb := '{}'::jsonb;
  beta_contract text;
  uid uuid := auth.uid();
  deletion_user text := nullif(
    pg_catalog.current_setting(
      'biblequest.native_account_deletion_user',
      true
    ),
    ''
  );
begin
  if auth.role() = 'service_role' then
    return true;
  end if;
  if uid is not null and deletion_user = uid::text then
    return true;
  end if;

  begin
    headers := coalesce(
      nullif(pg_catalog.current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception when others then
    raise exception 'native account beta is unavailable'
      using errcode = '55000';
  end;
  beta_contract := nullif(
    headers->>'x-biblequest-native-account-beta',
    ''
  );
  if beta_contract is null then
    return true;
  end if;
  if beta_contract <> 'v1' then
    raise exception 'native account beta is unavailable'
      using errcode = '55000';
  end if;
  if not exists (
    select 1
    from public.feature_flags
    where key = 'native_account_beta' and enabled
  ) then
    raise exception 'native account beta is unavailable'
      using errcode = '55000';
  end if;
  return true;
end;
$function$;

revoke all on function public.native_account_beta_request_allowed()
  from public, anon, authenticated, service_role;
grant execute on function public.native_account_beta_request_allowed()
  to authenticated;

-- A durable owner latch closes the gap between avatar cleanup and Auth
-- deletion. It has no client table grants and disappears only with the owner.
create table if not exists public.account_deletion_latches (
  user_id uuid primary key
    references auth.users(id) on delete cascade,
  begun_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.account_deletion_latches enable row level security;
alter table public.account_deletion_latches force row level security;
revoke all on table public.account_deletion_latches
  from public, anon, authenticated, service_role;

-- Every accepted Storage insert holds a shared owner-row lock until commit.
-- The begin RPC takes the conflicting update lock before setting the latch.
create or replace function public.avatar_upload_allowed()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return false;
  end if;

  perform public.native_account_beta_request_allowed();

  perform 1
  from auth.users
  where id = uid
  for share;

  if not found then
    return false;
  end if;

  return not exists (
    select 1
    from public.account_deletion_latches
    where user_id = uid
  );
end;
$function$;

alter function public.avatar_upload_allowed() owner to postgres;
revoke all on function public.avatar_upload_allowed()
  from public, anon, authenticated, service_role;
grant execute on function public.avatar_upload_allowed()
  to authenticated;

-- Reassert the owner-only Storage policy with the serialized deletion latch.
drop policy if exists "profile avatars: upload own" on storage.objects;
create policy "profile avatars: upload own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
  and name ~ (
    '^' || (select auth.uid()::text)
    || '/avatar-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}'
    || '-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
  )
  and (select public.avatar_upload_allowed())
);

-- Stop beta-header writes at the database even when an already-installed
-- client has not yet observed a remote disable response.
create or replace function public.enforce_native_account_beta_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.native_account_beta_request_allowed() then
    raise exception 'native account beta is unavailable'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function public.enforce_native_account_beta_availability()
  from public, anon, authenticated, service_role;

-- Cover every native sync relation with one restrictive policy and retain a
-- trigger because security-definer write RPCs bypass ordinary RLS evaluation.
do $block$
declare
  relation_name text;
begin
  foreach relation_name in array array[
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
  ] loop
    execute pg_catalog.format(
      'drop policy if exists "native account beta availability" on public.%I',
      relation_name
    );
    execute pg_catalog.format(
      'create policy "native account beta availability" on public.%I as restrictive for all to authenticated using (public.native_account_beta_request_allowed()) with check (public.native_account_beta_request_allowed())',
      relation_name
    );
    execute pg_catalog.format(
      'drop trigger if exists enforce_native_account_beta_availability on public.%I',
      relation_name
    );
    execute pg_catalog.format(
      'create trigger enforce_native_account_beta_availability before insert or update or delete on public.%I for each row execute function public.enforce_native_account_beta_availability()',
      relation_name
    );
  end loop;
end;
$block$;

-- Recheck the remote beta flag before any identity- and generation-bound RPC
-- can lock or mutate account state.
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
  if not public.native_account_beta_request_allowed() then
    raise exception 'native account beta is unavailable'
      using errcode = '55000';
  end if;
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

-- A generation check brackets every pull, so disabling the flag while a pull
-- is in flight prevents that response from being imported into local state.
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
  if not public.native_account_beta_request_allowed() then
    raise exception 'native account beta is unavailable'
      using errcode = '55000';
  end if;
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

-- Wrap the two destructive sync RPCs so replay shortcuts cannot return account
-- state before the native availability check reaches a table trigger.
alter function public.delete_user_sync_rows(uuid, bigint, uuid, jsonb)
  rename to delete_user_sync_rows_internal;
revoke all on function public.delete_user_sync_rows_internal(
  uuid, bigint, uuid, jsonb
) from public, anon, authenticated, service_role;

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
begin
  perform public.native_account_beta_request_allowed();
  return public.delete_user_sync_rows_internal(
    p_expected_user_id,
    p_expected_generation,
    p_request_id,
    p_deletions
  );
end;
$function$;

revoke all on function public.delete_user_sync_rows(
  uuid, bigint, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.delete_user_sync_rows(
  uuid, bigint, uuid, jsonb
) to authenticated;

alter function public.purge_user_data(uuid, bigint, uuid)
  rename to purge_user_data_internal;
revoke all on function public.purge_user_data_internal(uuid, bigint, uuid)
  from public, anon, authenticated, service_role;

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
begin
  perform public.native_account_beta_request_allowed();
  return public.purge_user_data_internal(
    p_expected_user_id,
    p_expected_generation,
    p_request_id
  );
end;
$function$;

revoke all on function public.purge_user_data(uuid, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_user_data(uuid, bigint, uuid)
  to authenticated;

-- Begin is idempotent and owner-bound. Web requests may omit the native
-- marker, while a present marker must be exact; both transports must present
-- the explicit cleanup marker and the caller-captured authenticated owner.
create or replace function public.begin_own_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  headers jsonb := '{}'::jsonb;
  beta_contract text;
  cleanup_contract text;
  expected_user text;
begin
  if uid is null then
    raise exception 'account deletion: not authenticated'
      using errcode = '42501';
  end if;

  begin
    headers := coalesce(
      nullif(pg_catalog.current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception when others then
    raise exception 'account deletion: invalid begin request'
      using errcode = '42501';
  end;

  beta_contract := nullif(
    headers->>'x-biblequest-native-account-beta',
    ''
  );
  cleanup_contract := nullif(
    headers->>'x-biblequest-account-deletion-cleanup',
    ''
  );
  expected_user := nullif(
    headers->>'x-biblequest-expected-user',
    ''
  );
  if cleanup_contract is distinct from 'v1'
     or expected_user is distinct from uid::text
     or (
       beta_contract is not null
       and beta_contract <> 'v1'
     ) then
    raise exception 'account deletion: invalid begin request'
      using errcode = '42501';
  end if;

  -- This conflicts with every accepted avatar insert's shared owner lock.
  perform 1
  from auth.users
  where id = uid
  for update;

  if not found then
    raise exception 'account deletion: authenticated user unavailable'
      using errcode = '42501';
  end if;

  insert into public.account_deletion_latches (user_id)
  values (uid)
  on conflict (user_id) do nothing;
end;
$function$;

alter function public.begin_own_account_deletion() owner to postgres;
revoke all on function public.begin_own_account_deletion()
  from public, anon, authenticated, service_role;
grant execute on function public.begin_own_account_deletion()
  to authenticated;

-- Preserve self-service erasure while disabled without opening Clear Data or
-- any other write path. The bypass is bound to auth.uid() and cleared again
-- after every cascading account row has been removed.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  current_generation bigint;
begin
  if uid is null then
    raise exception 'account deletion: not authenticated'
      using errcode = '42501';
  end if;

  perform 1
  from auth.users
  where id = uid
  for update;

  if not found then
    raise exception 'account deletion: authenticated user unavailable'
      using errcode = '42501';
  end if;

  -- Direct deletion remains safe even when a caller did not use the media
  -- cleanup route first; the owner lock serializes this latch with uploads.
  insert into public.account_deletion_latches (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  -- A direct RPC remains compatible only when there is no media to orphan.
  -- The owner lock and latch make this empty-folder proof stable.
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'profile-avatars'
      and (
        owner_id = uid::text
        or name like uid::text || '/%'
      )
  ) then
    raise exception 'account deletion: avatar cleanup incomplete'
      using errcode = '55000';
  end if;

  perform pg_catalog.set_config(
    'biblequest.native_account_deletion_user',
    uid::text,
    true
  );

  insert into public.user_sync_state (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  select generation
  into current_generation
  from public.user_sync_state
  where user_id = uid
  for update;

  perform pg_catalog.set_config(
    'biblequest.sync_expected_user',
    uid::text,
    true
  );
  perform pg_catalog.set_config(
    'biblequest.sync_generation',
    current_generation::text,
    true
  );

  perform public.purge_user_data_internal();

  delete from auth.users
  where id = uid;

  if not found then
    raise exception 'account deletion: authenticated user unavailable'
      using errcode = '42501';
  end if;

  perform pg_catalog.set_config(
    'biblequest.native_account_deletion_user',
    '',
    true
  );
end;
$function$;

alter function public.delete_own_account() owner to postgres;
revoke all on function public.delete_own_account()
  from public, anon, authenticated, service_role;
grant execute on function public.delete_own_account()
  to authenticated;

-- Keep the existing deletion identity while proving the native-only bypass is
-- installed before sync-state repair and remains sealed from anonymous users.
create or replace function public.account_deletion_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with latch_relation as (
  select
    relation.relrowsecurity
    and relation.relforcerowsecurity
    and exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = relation.oid
        and constraint_record.contype = 'p'
    )
    and exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = relation.oid
        and constraint_record.contype = 'f'
        and constraint_record.confrelid = 'auth.users'::regclass
        and constraint_record.confdeltype = 'c'
    )
    and not pg_catalog.has_table_privilege(
      'anon', relation.oid, 'SELECT'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated', relation.oid, 'SELECT'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated', relation.oid, 'INSERT'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated', relation.oid, 'UPDATE'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated', relation.oid, 'DELETE'
    )
    and not pg_catalog.has_table_privilege(
      'service_role', relation.oid, 'SELECT'
    )
    and not pg_catalog.has_table_privilege(
      'service_role', relation.oid, 'INSERT'
    ) as ok
  from pg_catalog.pg_class as relation
  where relation.oid = pg_catalog.to_regclass(
    'public.account_deletion_latches'
  )
), begin_boundary as (
  select
    procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and procedure.provolatile = 'v'
    and procedure.prosrc like '%auth.uid()%'
    and procedure.prosrc like '%x-biblequest-expected-user%'
    and procedure.prosrc like '%x-biblequest-account-deletion-cleanup%'
    and procedure.prosrc like '%x-biblequest-native-account-beta%'
    and procedure.prosrc like '%from auth.users%'
    and procedure.prosrc like '%for update%'
    and procedure.prosrc like '%account_deletion_latches%'
    and pg_catalog.strpos(
      procedure.prosrc,
      'from auth.users'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'insert into public.account_deletion_latches'
    )
    and pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'service_role', procedure.oid, 'EXECUTE'
    ) as ok
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.begin_own_account_deletion()'
  )
), delete_boundary as (
  select procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and procedure.prosrc like '%from auth.users%'
    and procedure.prosrc like '%insert into public.account_deletion_latches%'
    and procedure.prosrc like '%from storage.objects%'
    and procedure.prosrc like '%avatar cleanup incomplete%'
    and procedure.prosrc like '%insert into public.user_sync_state%'
    and procedure.prosrc like '%biblequest.sync_expected_user%'
    and procedure.prosrc like '%biblequest.sync_generation%'
    and procedure.prosrc like '%biblequest.native_account_deletion_user%'
    and procedure.prosrc like '%purge_user_data_internal%'
    and pg_catalog.strpos(
      procedure.prosrc,
      'from auth.users'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'insert into public.account_deletion_latches'
    )
    and pg_catalog.strpos(
      procedure.prosrc,
      'insert into public.account_deletion_latches'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'biblequest.native_account_deletion_user'
    )
    and pg_catalog.strpos(
      procedure.prosrc,
      'from storage.objects'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'biblequest.native_account_deletion_user'
    )
    and pg_catalog.strpos(
      procedure.prosrc,
      'biblequest.native_account_deletion_user'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'insert into public.user_sync_state'
    )
    and pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon', procedure.oid, 'EXECUTE'
    ) as ok
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.delete_own_account()'
  )
)
select pg_catalog.jsonb_build_object(
  'contract', 'generation_bound_account_deletion_v2',
  'ready',
    pg_catalog.to_regprocedure(
      'public.purge_user_data_internal()'
    ) is not null
    and coalesce((select ok from latch_relation), false)
    and coalesce((select ok from begin_boundary), false)
    and coalesce((select ok from delete_boundary), false)
);
$function$;

revoke all on function public.account_deletion_contract()
  from public, authenticated, service_role;
grant execute on function public.account_deletion_contract()
  to anon;

-- Recheck the durable latch after Storage upload and before publishing its
-- pointer. This covers the separate-transaction gap between those operations.
create or replace function public.set_profile_avatar(
  p_avatar_path text,
  p_avatar_version uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  current_generation bigint;
  previous_path text;
  changed_at timestamptz := pg_catalog.clock_timestamp();
begin
  if uid is null then
    raise exception 'profile avatar: not authenticated'
      using errcode = '42501';
  end if;
  if p_avatar_version is null
     or p_avatar_path <> (
       uid::text || '/avatar-' || p_avatar_version::text || '.webp'
     ) then
    raise exception 'profile avatar: invalid path'
      using errcode = '22023';
  end if;
  if not public.avatar_upload_allowed() then
    raise exception 'profile avatar: account deletion in progress'
      using errcode = '55000';
  end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'profile-avatars'
      and name = p_avatar_path
      and owner_id = uid::text
  ) then
    raise exception 'profile avatar: object unavailable'
      using errcode = 'P0002';
  end if;

  -- Media RPCs bind the live owner generation internally; HTTP avatar calls
  -- do not carry the journey sync generation header.
  select generation
  into current_generation
  from public.user_sync_state
  where user_id = uid
  for share;

  if current_generation is null then
    raise exception 'profile avatar: account state unavailable'
      using errcode = '40001';
  end if;

  perform pg_catalog.set_config(
    'biblequest.sync_expected_user',
    uid::text,
    true
  );
  perform pg_catalog.set_config(
    'biblequest.sync_generation',
    current_generation::text,
    true
  );

  select avatar_path
  into previous_path
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'profile avatar: profile unavailable'
      using errcode = 'P0002';
  end if;

  update public.profiles
  set
    avatar_path = p_avatar_path,
    avatar_version = p_avatar_version,
    avatar_updated_at = changed_at
  where id = uid;

  perform pg_catalog.set_config(
    'biblequest.sync_expected_user',
    '',
    true
  );
  perform pg_catalog.set_config(
    'biblequest.sync_generation',
    '',
    true
  );

  return pg_catalog.jsonb_build_object(
    'avatar_path', p_avatar_path,
    'avatar_version', p_avatar_version,
    'avatar_updated_at', changed_at,
    'previous_path', previous_path
  );
end;
$function$;

alter function public.set_profile_avatar(text, uuid) owner to postgres;
revoke all on function public.set_profile_avatar(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_profile_avatar(text, uuid)
  to authenticated;

-- Avatar object cleanup precedes identity deletion in a separate request. Only
-- this exact authenticated cleanup marker may clear the owner's profile
-- pointer while the beta is disabled; ordinary avatar requests still fail.
create or replace function public.clear_profile_avatar(
  p_expected_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  current_generation bigint;
  headers jsonb := '{}'::jsonb;
  beta_contract text;
  cleanup_contract text;
  expected_user text;
  cleanup_requested boolean := false;
  previous_path text;
  response jsonb;
begin
  if uid is null then
    raise exception 'profile avatar: not authenticated'
      using errcode = '42501';
  end if;

  begin
    headers := coalesce(
      nullif(pg_catalog.current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception when others then
    raise exception 'profile avatar: invalid deletion cleanup'
      using errcode = '42501';
  end;
  cleanup_contract := nullif(
    headers->>'x-biblequest-account-deletion-cleanup',
    ''
  );
  beta_contract := nullif(
    headers->>'x-biblequest-native-account-beta',
    ''
  );
  expected_user := nullif(
    headers->>'x-biblequest-expected-user',
    ''
  );
  if cleanup_contract is not null and (
    cleanup_contract <> 'v1'
    or expected_user is distinct from uid::text
    or (
      beta_contract is not null
      and beta_contract <> 'v1'
    )
  ) then
    raise exception 'profile avatar: invalid deletion cleanup'
      using errcode = '42501';
  end if;
  cleanup_requested := cleanup_contract is not null
    and cleanup_contract = 'v1';

  if cleanup_requested then
    if not exists (
      select 1
      from public.account_deletion_latches
      where user_id = uid
    ) then
      raise exception 'account deletion: not begun'
        using errcode = '42501';
    end if;
    perform pg_catalog.set_config(
      'biblequest.native_account_deletion_user',
      uid::text,
      true
    );

    -- Clear Journey may already have removed the profile, and resilient
    -- deletion also supports a missing retained state row. Repair only the
    -- deletion caller's state so mandatory media cleanup cannot strand them.
    insert into public.user_sync_state (user_id)
    values (uid)
    on conflict (user_id) do nothing;
  else
    perform public.native_account_beta_request_allowed();
  end if;

  -- The avatar contract owns these profile columns and binds their trigger to
  -- the current account generation inside the RPC transaction.
  select generation
  into current_generation
  from public.user_sync_state
  where user_id = uid
  for share;

  if current_generation is null then
    raise exception 'profile avatar: account state unavailable'
      using errcode = '40001';
  end if;

  perform pg_catalog.set_config(
    'biblequest.sync_expected_user',
    uid::text,
    true
  );
  perform pg_catalog.set_config(
    'biblequest.sync_generation',
    current_generation::text,
    true
  );

  select avatar_path
  into previous_path
  from public.profiles
  where id = uid
  for update;

  if not found and not cleanup_requested then
    raise exception 'profile avatar: profile unavailable'
      using errcode = 'P0002';
  elsif not found then
    response := pg_catalog.jsonb_build_object(
      'cleared', true,
      'previous_path', null
    );
  elsif not cleanup_requested
     and previous_path is distinct from p_expected_path then
    response := pg_catalog.jsonb_build_object(
      'cleared', false,
      'previous_path', previous_path
    );
  else
    update public.profiles
    set
      avatar_path = null,
      avatar_version = null,
      avatar_updated_at = null
    where id = uid;

    response := pg_catalog.jsonb_build_object(
      'cleared', true,
      'previous_path', previous_path
    );
  end if;

  if cleanup_requested then
    perform pg_catalog.set_config(
      'biblequest.native_account_deletion_user',
      '',
      true
    );
  end if;
  perform pg_catalog.set_config(
    'biblequest.sync_expected_user',
    '',
    true
  );
  perform pg_catalog.set_config(
    'biblequest.sync_generation',
    '',
    true
  );
  return response;
end;
$function$;

alter function public.clear_profile_avatar(text) owner to postgres;
revoke all on function public.clear_profile_avatar(text)
  from public, anon, authenticated, service_role;
grant execute on function public.clear_profile_avatar(text)
  to authenticated;

-- Keep the avatar v1 contract while proving the cleanup exception is sealed
-- inside clear_profile_avatar and ordinary avatar mutation remains hardened.
create or replace function public.profile_avatar_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with avatar_columns as (
  select
    pg_catalog.count(*) = 3
    and pg_catalog.bool_and(
      column_record.is_nullable = 'YES'
      and case column_record.column_name
        when 'avatar_path' then column_record.data_type = 'text'
        when 'avatar_version' then column_record.data_type = 'uuid'
        when 'avatar_updated_at' then
          column_record.data_type = 'timestamp with time zone'
        else false
      end
    ) as ok
  from information_schema.columns as column_record
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name in (
      'avatar_path',
      'avatar_version',
      'avatar_updated_at'
    )
), private_bucket as (
  select
    not bucket.public
    and bucket.file_size_limit = 1048576
    and bucket.allowed_mime_types = array['image/webp']::text[] as ok
  from storage.buckets as bucket
  where bucket.id = 'profile-avatars'
), object_policies as (
  select
    pg_catalog.count(*) = 3
    and pg_catalog.bool_and(
      policy.roles = array['authenticated']::name[]
    )
    and pg_catalog.bool_and(
      case policy.policyname
        when 'profile avatars: read own' then
          policy.cmd = 'SELECT'
          and policy.qual like '%profile-avatars%'
          and policy.qual like '%foldername%'
          and policy.qual like '%owner_id%'
          and policy.with_check is null
        when 'profile avatars: upload own' then
          policy.cmd = 'INSERT'
          and policy.qual is null
          and policy.with_check like '%profile-avatars%'
          and policy.with_check like '%foldername%'
          and policy.with_check like '%owner_id%'
          and policy.with_check like '%avatar-%'
          and policy.with_check like '%avatar_upload_allowed%'
        when 'profile avatars: delete own' then
          policy.cmd = 'DELETE'
          and policy.qual like '%profile-avatars%'
          and policy.qual like '%foldername%'
          and policy.qual like '%owner_id%'
          and policy.with_check is null
        else false
      end
    ) as ok
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'storage'
    and policy.tablename = 'objects'
    and policy.policyname in (
      'profile avatars: read own',
      'profile avatars: upload own',
      'profile avatars: delete own'
    )
), avatar_constraint as (
  select pg_catalog.count(*) = 1 as ok
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.profiles'::regclass
    and constraint_record.conname = 'profiles_avatar_state_check'
    and constraint_record.contype = 'c'
    and pg_catalog.pg_get_constraintdef(
      constraint_record.oid,
      true
    ) like '%avatar_path%'
    and pg_catalog.pg_get_constraintdef(
      constraint_record.oid,
      true
    ) like '%avatar_version%'
    and pg_catalog.pg_get_constraintdef(
      constraint_record.oid,
      true
    ) like '%avatar_updated_at%'
), avatar_functions(signature) as (
  values
    ('public.set_profile_avatar(text,uuid)'),
    ('public.clear_profile_avatar(text)')
), hardened_functions as (
  select pg_catalog.count(*) = 2 as ok
  from avatar_functions
  join pg_catalog.pg_proc as procedure
    on procedure.oid = pg_catalog.to_regprocedure(avatar_functions.signature)
  where procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon', procedure.oid, 'EXECUTE'
    )
), upload_boundary as (
  select
    helper.prosecdef
    and helper.proconfig = array['search_path=""']::text[]
    and helper.provolatile = 'v'
    and helper.prosrc like '%native_account_beta_request_allowed%'
    and helper.prosrc like '%from auth.users%'
    and helper.prosrc like '%for share%'
    and helper.prosrc like '%account_deletion_latches%'
    and pg_catalog.strpos(
      helper.prosrc,
      'from auth.users'
    ) < pg_catalog.strpos(
      helper.prosrc,
      'from public.account_deletion_latches'
    )
    and pg_catalog.has_function_privilege(
      'authenticated', helper.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon', helper.oid, 'EXECUTE'
    )
    and setter.prosrc like '%avatar_upload_allowed%'
    and setter.prosrc like '%from public.user_sync_state%'
    and setter.prosrc like '%biblequest.sync_expected_user%'
    and setter.prosrc like '%biblequest.sync_generation%'
    and pg_catalog.strpos(
      setter.prosrc,
      'avatar_upload_allowed'
    ) < pg_catalog.strpos(
      setter.prosrc,
      'update public.profiles'
    ) as ok
  from pg_catalog.pg_proc as helper
  cross join pg_catalog.pg_proc as setter
  where helper.oid = pg_catalog.to_regprocedure(
      'public.avatar_upload_allowed()'
    )
    and setter.oid = pg_catalog.to_regprocedure(
      'public.set_profile_avatar(text,uuid)'
    )
), cleanup_boundary as (
  select
    procedure.prosrc like '%x-biblequest-account-deletion-cleanup%'
    and procedure.prosrc like '%x-biblequest-native-account-beta%'
    and procedure.prosrc like '%x-biblequest-expected-user%'
    and procedure.prosrc like '%biblequest.native_account_deletion_user%'
    and procedure.prosrc like '%native_account_beta_request_allowed%'
    and procedure.prosrc like '%account_deletion_latches%'
    and procedure.prosrc like '%from public.user_sync_state%'
    and procedure.prosrc like '%biblequest.sync_expected_user%'
    and procedure.prosrc like '%biblequest.sync_generation%'
    and procedure.prosrc like '%auth.uid()%'
    and procedure.prosrc like '%cleanup_contract <> ''v1''%'
    and procedure.prosrc like '%cleanup_contract is not null%'
    and procedure.prosrc like '%expected_user is distinct from uid::text%'
    and procedure.prosrc like '%beta_contract is not null%'
    and procedure.prosrc like '%beta_contract <> ''v1''%'
    as ok
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.clear_profile_avatar(text)'
  )
), sealed_profile_columns as (
  select
    not pg_catalog.has_column_privilege(
      'authenticated', 'public.profiles', 'avatar_path', 'UPDATE'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated', 'public.profiles', 'avatar_version', 'UPDATE'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated', 'public.profiles', 'avatar_updated_at', 'UPDATE'
    ) as ok
), obsolete_functions as (
  select pg_catalog.to_regprocedure(
    'public.clear_profile_avatar()'
  ) is null as ok
)
select pg_catalog.jsonb_build_object(
  'contract',
  'biblequest_profile_avatar_v1',
  'ok',
    coalesce((select ok from avatar_columns), false)
    and coalesce((select ok from private_bucket), false)
    and coalesce((select ok from object_policies), false)
    and coalesce((select ok from avatar_constraint), false)
    and coalesce((select ok from hardened_functions), false)
    and coalesce((select ok from upload_boundary), false)
    and coalesce((select ok from cleanup_boundary), false)
    and coalesce((select ok from sealed_profile_columns), false)
    and coalesce((select ok from obsolete_functions), false)
);
$function$;

alter function public.profile_avatar_contract() owner to postgres;
revoke all on function public.profile_avatar_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.profile_avatar_contract()
  to anon, authenticated, service_role;

-- The guided-progress contract previously required exactly two policies. It
-- now also verifies the restrictive native boundary without changing its
-- client-visible v1 identity.
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
    pg_catalog.count(*) = 3
    and pg_catalog.count(*) filter (
      where policy.cmd = 'SELECT'
        and policy.roles = array['authenticated']::name[]
        and policy.qual = '(auth.uid() = user_id)'
    ) = 1
    and pg_catalog.count(*) filter (
      where policy.cmd = 'INSERT'
        and policy.roles = array['authenticated']::name[]
        and policy.with_check = '(auth.uid() = user_id)'
    ) = 1
    and pg_catalog.count(*) filter (
      where policy.policyname = 'native account beta availability'
        and policy.permissive = 'RESTRICTIVE'
        and policy.cmd = 'ALL'
        and policy.roles = array['authenticated']::name[]
        and policy.qual like '%native_account_beta_request_allowed%'
        and policy.with_check like '%native_account_beta_request_allowed%'
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
