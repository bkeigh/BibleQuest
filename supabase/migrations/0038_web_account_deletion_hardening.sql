-- Serialize avatar ownership with web account deletion without enabling the
-- separate native account beta introduced by migration 0037.
create table if not exists public.account_deletion_latches (
  user_id uuid primary key
    references auth.users(id) on delete cascade,
  begun_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.account_deletion_latches enable row level security;
alter table public.account_deletion_latches force row level security;
revoke all on table public.account_deletion_latches
  from public, anon, authenticated, service_role;

-- Hold a shared Auth-owner lock for every accepted upload. The optional
-- native predicate preserves migration 0037 when both migrations are present.
create or replace function public.avatar_upload_allowed()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  native_allowed boolean := true;
begin
  if uid is null then
    return false;
  end if;

  if pg_catalog.to_regprocedure(
       'public.native_account_beta_request_allowed()'
     ) is not null then
    execute 'select public.native_account_beta_request_allowed()'
    into native_allowed;
    if native_allowed is distinct from true then
      return false;
    end if;
  end if;

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

-- Reassert the private owner policy with the serialized deletion predicate.
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

-- Keep the latch check mandatory even if another permissive policy drifts in.
drop policy if exists "profile avatars: account deletion guard"
on storage.objects;
create policy "profile avatars: account deletion guard"
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'profile-avatars'
  or (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    and owner_id = (select auth.uid()::text)
    and name ~ (
      '^' || (select auth.uid()::text)
      || '/avatar-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}'
      || '-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
    )
    and (select public.avatar_upload_allowed())
  )
);

-- Recheck the latch after upload so a pre-latch object cannot publish a stale
-- profile pointer after the deletion sweep has removed that object.
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

-- Latch one exact authenticated owner after waiting for in-flight uploads.
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
     or (beta_contract is not null and beta_contract <> 'v1') then
    raise exception 'account deletion: invalid begin request'
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

-- Expose only the authenticated owner's durable deletion-pending state.
create or replace function public.own_account_deletion_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  headers jsonb := '{}'::jsonb;
  expected_user text;
begin
  if uid is null then
    raise exception 'account deletion status: not authenticated'
      using errcode = '42501';
  end if;

  begin
    headers := coalesce(
      nullif(pg_catalog.current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception when others then
    raise exception 'account deletion status: invalid request'
      using errcode = '42501';
  end;
  expected_user := nullif(headers->>'x-biblequest-expected-user', '');
  if expected_user is distinct from uid::text then
    raise exception 'account deletion status: invalid request'
      using errcode = '42501';
  end if;

  perform 1
  from auth.users
  where id = uid
  for share;

  if not found then
    raise exception 'account deletion status: authenticated user unavailable'
      using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'contract', 'biblequest_account_deletion_status_v1',
    'pending', exists (
      select 1
      from public.account_deletion_latches
      where user_id = uid
    )
  );
end;
$function$;

alter function public.own_account_deletion_status() owner to postgres;
revoke all on function public.own_account_deletion_status()
  from public, anon, authenticated, service_role;
grant execute on function public.own_account_deletion_status()
  to authenticated;

-- Latch direct callers, prove Storage empty under the owner lock, then run the
-- existing generation-bound purge and Auth deletion transaction.
create or replace function public.delete_own_account()
returns void
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
    raise exception 'account deletion: invalid cleanup request'
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
  if (cleanup_contract is not null and cleanup_contract <> 'v1')
     or (expected_user is not null and expected_user <> uid::text)
     or (beta_contract is not null and beta_contract <> 'v1') then
    raise exception 'account deletion: invalid cleanup request'
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

  insert into public.account_deletion_latches (user_id)
  values (uid)
  on conflict (user_id) do nothing;

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
end;
$function$;

alter function public.delete_own_account() owner to postgres;
revoke all on function public.delete_own_account()
  from public, anon, authenticated, service_role;
grant execute on function public.delete_own_account()
  to authenticated;

-- Publish a content-free contract that distinguishes this Storage-safe web
-- boundary from the pre-hardening 0022 account deletion contract.
create or replace function public.account_deletion_storage_contract()
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
      'anon', relation.oid, 'INSERT'
    )
    and not pg_catalog.has_table_privilege(
      'anon', relation.oid, 'UPDATE'
    )
    and not pg_catalog.has_table_privilege(
      'anon', relation.oid, 'DELETE'
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
    )
    and not pg_catalog.has_table_privilege(
      'service_role', relation.oid, 'UPDATE'
    )
    and not pg_catalog.has_table_privilege(
      'service_role', relation.oid, 'DELETE'
    ) as ok
  from pg_catalog.pg_class as relation
  where relation.oid = pg_catalog.to_regclass(
    'public.account_deletion_latches'
  )
), upload_boundary as (
  select
    procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and procedure.provolatile = 'v'
    and procedure.prosrc like '%native_account_beta_request_allowed%'
    and procedure.prosrc like '%from auth.users%'
    and procedure.prosrc like '%for share%'
    and procedure.prosrc like '%account_deletion_latches%'
    and pg_catalog.strpos(
      procedure.prosrc,
      'from auth.users'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'from public.account_deletion_latches'
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
    'public.avatar_upload_allowed()'
  )
), upload_policy as (
  select
    exists (
      select 1
      from pg_catalog.pg_policies as policy
      where policy.schemaname = 'storage'
        and policy.tablename = 'objects'
        and policy.policyname = 'profile avatars: upload own'
        and policy.permissive = 'PERMISSIVE'
        and policy.cmd = 'INSERT'
        and policy.roles = array['authenticated']::name[]
        and coalesce(policy.with_check, '') like '%avatar_upload_allowed%'
        and coalesce(policy.with_check, '') like '%owner_id%'
        and coalesce(policy.with_check, '') like '%auth.uid()%'
    )
    and exists (
      select 1
      from pg_catalog.pg_policies as policy
      where policy.schemaname = 'storage'
        and policy.tablename = 'objects'
        and policy.policyname = 'profile avatars: account deletion guard'
        and policy.permissive = 'RESTRICTIVE'
        and policy.cmd = 'INSERT'
        and policy.roles = array['authenticated']::name[]
        and coalesce(policy.with_check, '') like '%profile-avatars%'
        and coalesce(policy.with_check, '') like '%avatar_upload_allowed%'
        and coalesce(policy.with_check, '') like '%owner_id%'
        and coalesce(policy.with_check, '') like '%auth.uid()%'
    ) as ok
), pointer_boundary as (
  select
    procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and procedure.prosrc like '%avatar_upload_allowed%'
    and procedure.prosrc like '%from storage.objects%'
    and procedure.prosrc like '%update public.profiles%'
    and pg_catalog.strpos(
      procedure.prosrc,
      'avatar_upload_allowed'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'from storage.objects'
    )
    and pg_catalog.strpos(
      procedure.prosrc,
      'from storage.objects'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'update public.profiles'
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
    'public.set_profile_avatar(text,uuid)'
  )
), begin_boundary as (
  select
    procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and procedure.provolatile = 'v'
    and procedure.prosrc like '%auth.uid()%'
    and procedure.prosrc like '%x-biblequest-expected-user%'
    and procedure.prosrc like '%x-biblequest-account-deletion-cleanup%'
    and procedure.prosrc like '%from auth.users%'
    and procedure.prosrc like '%for update%'
    and procedure.prosrc like '%account_deletion_latches%'
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
), status_boundary as (
  select
    procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and procedure.provolatile = 'v'
    and procedure.prosrc like '%auth.uid()%'
    and procedure.prosrc like '%x-biblequest-expected-user%'
    and procedure.prosrc like '%from auth.users%'
    and procedure.prosrc like '%for share%'
    and procedure.prosrc like '%account_deletion_latches%'
    and procedure.prosrc like '%biblequest_account_deletion_status_v1%'
    and pg_catalog.strpos(
      procedure.prosrc,
      'from auth.users'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'from public.account_deletion_latches'
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
    'public.own_account_deletion_status()'
  )
), delete_boundary as (
  select
    procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and procedure.prosrc like '%from auth.users%'
    and procedure.prosrc like '%for update%'
    and procedure.prosrc like '%insert into public.account_deletion_latches%'
    and procedure.prosrc like '%from storage.objects%'
    and procedure.prosrc like '%avatar cleanup incomplete%'
    and procedure.prosrc like '%purge_user_data_internal%'
    and pg_catalog.strpos(
      procedure.prosrc,
      'insert into public.account_deletion_latches'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'from storage.objects'
    )
    and pg_catalog.strpos(
      procedure.prosrc,
      'from storage.objects'
    ) < pg_catalog.strpos(
      procedure.prosrc,
      'purge_user_data_internal'
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
    'public.delete_own_account()'
  )
), contract_boundary as (
  select
    procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and pg_catalog.has_function_privilege(
      'anon', procedure.oid, 'EXECUTE'
    )
    and pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'service_role', procedure.oid, 'EXECUTE'
    ) as ok
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.account_deletion_storage_contract()'
  )
)
select pg_catalog.jsonb_build_object(
  'contract', 'biblequest_account_deletion_storage_v1',
  'ok',
    coalesce((select ok from latch_relation), false)
    and coalesce((select ok from upload_boundary), false)
    and coalesce((select ok from upload_policy), false)
    and coalesce((select ok from pointer_boundary), false)
    and coalesce((select ok from begin_boundary), false)
    and coalesce((select ok from status_boundary), false)
    and coalesce((select ok from delete_boundary), false)
    and coalesce((select ok from contract_boundary), false)
);
$function$;

alter function public.account_deletion_storage_contract() owner to postgres;
revoke all on function public.account_deletion_storage_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.account_deletion_storage_contract()
  to anon, authenticated;

-- Preserve the avatar contract while proving the restrictive deletion latch.
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
    pg_catalog.count(*) = 4
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
        when 'profile avatars: account deletion guard' then
          policy.permissive = 'RESTRICTIVE'
          and policy.cmd = 'INSERT'
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
      'profile avatars: account deletion guard',
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
    and coalesce((select ok from sealed_profile_columns), false)
    and coalesce((select ok from obsolete_functions), false)
);
$function$;

alter function public.profile_avatar_contract() owner to postgres;
revoke all on function public.profile_avatar_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.profile_avatar_contract()
  to anon, authenticated, service_role;
