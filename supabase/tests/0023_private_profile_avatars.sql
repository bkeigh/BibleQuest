begin;

-- Linked CLI tests enter through a restricted login; use the database owner.
set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

select is(
  public.profile_avatar_contract(),
  '{"contract":"biblequest_profile_avatar_v1","ok":true}'::jsonb,
  'the private avatar contract is ready'
);
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name in (
        'avatar_path',
        'avatar_version',
        'avatar_updated_at'
      )
  ),
  3::bigint,
  'all three avatar pointer columns exist'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_avatar_state_check'
      and contype = 'c'
  ),
  1::bigint,
  'the profile pointer state is constrained'
);
select is(
  (
    select jsonb_build_object(
      'public', public,
      'limit', file_size_limit,
      'mimes', allowed_mime_types
    )
    from storage.buckets
    where id = 'profile-avatars'
  ),
  jsonb_build_object(
    'public', false,
    'limit', 1048576,
    'mimes', array['image/webp']::text[]
  ),
  'the avatar bucket is private and bounded'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'profile avatars:%'
  ),
  4::bigint,
  'Storage exposes only the three owner policies and deletion guard'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.set_profile_avatar(text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.clear_profile_avatar(text)',
    'EXECUTE'
  ),
  'authenticated users may mutate only their avatar pointer'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.set_profile_avatar(text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.clear_profile_avatar(text)',
    'EXECUTE'
  ),
  'anonymous callers cannot mutate avatar pointers'
);

-- Create two real-shaped owners to exercise both profile and Storage RLS.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'a1000000-0000-4000-8000-000000000001/avatar-a1111111-1111-4111-8111-111111111111.webp',
      'a1000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )$$,
  'an owner may upload one exact-path normalized object'
);
select throws_ok(
  $$select public.set_profile_avatar(
      'a1000000-0000-4000-8000-000000000001/avatar-a1999999-9999-4999-8999-999999999999.webp',
      'a1999999-9999-4999-8999-999999999999'
    )$$,
  'P0002',
  'profile avatar: object unavailable',
  'a pointer cannot target an object that does not exist'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'a2000000-0000-4000-8000-000000000002/avatar-a2111111-1111-4111-8111-111111111111.webp',
      'a1000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )$$,
  '42501',
  null,
  'an owner cannot upload into another account folder'
);
select lives_ok(
  $$select public.set_profile_avatar(
      'a1000000-0000-4000-8000-000000000001/avatar-a1111111-1111-4111-8111-111111111111.webp',
      'a1111111-1111-4111-8111-111111111111'
    )$$,
  'the owner may atomically set the matching pointer'
);
select is(
  (
    select avatar_version
    from public.profiles
    where id = 'a1000000-0000-4000-8000-000000000001'
  ),
  'a1111111-1111-4111-8111-111111111111'::uuid,
  'the owner sees the exact stored version'
);
select throws_ok(
  $$update public.profiles
    set avatar_version = 'a1999999-9999-4999-8999-999999999999'
    where id = 'a1000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'generic clients cannot directly update media-owned columns'
);

select set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-4000-8000-000000000002',
  true
);
select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'profile-avatars'
  ),
  0::bigint,
  'another account cannot read the owner object'
);
select throws_ok(
  $$select public.set_profile_avatar(
      'a1000000-0000-4000-8000-000000000001/avatar-a1111111-1111-4111-8111-111111111111.webp',
      'a1111111-1111-4111-8111-111111111111'
    )$$,
  '22023',
  'profile avatar: invalid path',
  'another account cannot point at the owner object'
);

select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'profile-avatars'
  ),
  1::bigint,
  'the owner can read their private object'
);
select is(
  (
    public.clear_profile_avatar(
      'a1000000-0000-4000-8000-000000000001/avatar-a1999999-9999-4999-8999-999999999999.webp'
    )->>'cleared'
  )::boolean,
  false,
  'a stale delete cannot clear a concurrently changed pointer'
);
select lives_ok(
  $$select public.clear_profile_avatar(
      'a1000000-0000-4000-8000-000000000001/avatar-a1111111-1111-4111-8111-111111111111.webp'
    )$$,
  'the owner may clear their profile pointer'
);
select is(
  (
    select count(*)
    from public.profiles
    where id = 'a1000000-0000-4000-8000-000000000001'
      and avatar_path is null
      and avatar_version is null
      and avatar_updated_at is null
  ),
  1::bigint,
  'pointer clearing leaves one valid all-null state'
);
-- Supabase Storage sets this transaction flag only after its object-service
-- cleanup; the test uses it to exercise DELETE RLS without orphaning bytes.
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok(
  $$delete from storage.objects
    where bucket_id = 'profile-avatars'
      and name = 'a1000000-0000-4000-8000-000000000001/avatar-a1111111-1111-4111-8111-111111111111.webp'$$,
  'the owner may remove their obsolete object'
);
select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'profile-avatars'
  ),
  0::bigint,
  'the private object is removed'
);

reset role;
set role postgres;
set local role anon;
select is(
  public.profile_avatar_contract(),
  '{"contract":"biblequest_profile_avatar_v1","ok":true}'::jsonb,
  'anonymous readiness remains fixed and content-free'
);

select * from finish();
rollback;
