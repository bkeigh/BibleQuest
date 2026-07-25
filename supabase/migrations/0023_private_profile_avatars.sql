-- Private, owner-only profile avatars. The generic profile sync RPC remains
-- unable to mutate these server-owned columns.
alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists avatar_version uuid,
  add column if not exists avatar_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_avatar_state_check;
alter table public.profiles
  add constraint profiles_avatar_state_check check (
    (
      avatar_path is null
      and avatar_version is null
      and avatar_updated_at is null
    )
    or (
      avatar_path =
        id::text || '/avatar-' || avatar_version::text || '.webp'
      and avatar_updated_at is not null
    )
  );

-- Bucket configuration is intentionally private and accepts only normalized
-- WebP objects emitted by the authenticated server route.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'profile-avatars',
  'profile-avatars',
  false,
  1048576,
  array['image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile avatars: read own" on storage.objects;
create policy "profile avatars: read own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);

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
);

drop policy if exists "profile avatars: delete own" on storage.objects;
create policy "profile avatars: delete own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);

-- Atomically switches the profile pointer after Storage upload succeeds.
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

  return pg_catalog.jsonb_build_object(
    'avatar_path', p_avatar_path,
    'avatar_version', p_avatar_version,
    'avatar_updated_at', changed_at,
    'previous_path', previous_path
  );
end;
$function$;

-- Clears only the caller's profile pointer after the object is removed.
drop function if exists public.clear_profile_avatar();
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
  previous_path text;
begin
  if uid is null then
    raise exception 'profile avatar: not authenticated'
      using errcode = '42501';
  end if;

  select avatar_path
  into previous_path
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'profile avatar: profile unavailable'
      using errcode = 'P0002';
  end if;

  if previous_path is distinct from p_expected_path then
    return pg_catalog.jsonb_build_object(
      'cleared', false,
      'previous_path', previous_path
    );
  end if;

  update public.profiles
  set
    avatar_path = null,
    avatar_version = null,
    avatar_updated_at = null
  where id = uid;

  return pg_catalog.jsonb_build_object(
    'cleared', true,
    'previous_path', previous_path
  );
end;
$function$;

alter function public.set_profile_avatar(text, uuid) owner to postgres;
alter function public.clear_profile_avatar(text) owner to postgres;
revoke all on function public.set_profile_avatar(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.clear_profile_avatar(text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_profile_avatar(text, uuid)
  to authenticated;
grant execute on function public.clear_profile_avatar(text)
  to authenticated;

-- Exposes a two-field, content-free migration and authorization posture.
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
