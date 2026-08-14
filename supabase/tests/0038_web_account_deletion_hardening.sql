begin;

-- Linked CLI tests enter through a restricted login; use the database owner.
set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

select is(
  public.account_deletion_storage_contract(),
  '{"contract":"biblequest_account_deletion_storage_v1","ok":true}'::jsonb,
  'the web deletion Storage contract is complete'
);
select ok(
  has_function_privilege(
    'anon',
    'public.account_deletion_storage_contract()',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.account_deletion_storage_contract()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.account_deletion_storage_contract()',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.own_account_deletion_status()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.own_account_deletion_status()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.own_account_deletion_status()',
    'EXECUTE'
  ),
  'readiness and the authenticated delete route may invoke the contract'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.account_deletion_latches', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.account_deletion_latches', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.account_deletion_latches', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.account_deletion_latches', 'DELETE'
  )
  and not has_table_privilege(
    'service_role', 'public.account_deletion_latches', 'SELECT'
  )
  and not has_table_privilege(
    'service_role', 'public.account_deletion_latches', 'INSERT'
  )
  and not has_table_privilege(
    'service_role', 'public.account_deletion_latches', 'UPDATE'
  )
  and not has_table_privilege(
    'service_role', 'public.account_deletion_latches', 'DELETE'
  ),
  'the durable latch has no client or service-role table privileges'
);
select ok(
  (
    select procedure.prosrc like '%from auth.users%'
      and procedure.prosrc like '%for share%'
      and pg_catalog.strpos(
        procedure.prosrc,
        'from auth.users'
      ) < pg_catalog.strpos(
        procedure.prosrc,
        'from public.account_deletion_latches'
      )
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure(
      'public.avatar_upload_allowed()'
    )
  )
  and (
    select procedure.prosrc like '%for update%'
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure(
      'public.begin_own_account_deletion()'
    )
  ),
  'shared upload locks serialize with the deletion owner lock'
);

-- Create two isolated owners for residue, stale-token, and cross-owner checks.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config('request.headers', '{}', true);
select throws_ok(
  $$select public.begin_own_account_deletion()$$,
  '42501',
  'account deletion: invalid begin request',
  'deletion begin rejects missing cleanup and expected-owner headers'
);
select throws_ok(
  $$select public.own_account_deletion_status()$$,
  '42501',
  'account deletion status: invalid request',
  'deletion status rejects a missing expected-owner header'
);
select pg_catalog.set_config('request.headers', 'not-json', true);
select throws_ok(
  $$select public.own_account_deletion_status()$$,
  '42501',
  'account deletion status: invalid request',
  'deletion status rejects malformed request headers'
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-expected-user":"e1000000-0000-4000-8000-000000000001"}',
  true
);
select is(
  public.own_account_deletion_status(),
  '{"contract":"biblequest_account_deletion_status_v1","pending":false}'::jsonb,
  'a live owner starts without a durable deletion latch'
);
select pg_catalog.set_config('request.headers', '{}', true);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"e1000000-0000-4000-8000-000000000001"}',
  true
);
select lives_ok(
  $sql$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'e1000000-0000-4000-8000-000000000001/avatar-e1111111-1111-4111-8111-111111111111.webp',
      'e1000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $sql$,
  'the owner may upload before deletion begins'
);
select lives_ok(
  $$select public.set_profile_avatar(
    'e1000000-0000-4000-8000-000000000001/avatar-e1111111-1111-4111-8111-111111111111.webp',
    'e1111111-1111-4111-8111-111111111111'
  )$$,
  'the pre-latch object may publish before deletion begins'
);
select throws_ok(
  $$select public.delete_own_account()$$,
  '55000',
  'account deletion: avatar cleanup incomplete',
  'direct deletion refuses an unswept owner object'
);

-- Inspect Auth residue as the database owner, then restore the owner JWT.
reset role;
set role postgres;
select is(
  (
    select pg_catalog.count(*)
    from auth.users
    where id = 'e1000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'failed direct deletion preserves the Auth identity'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"e1000000-0000-4000-8000-000000000001"}',
  true
);
select lives_ok(
  $$select public.begin_own_account_deletion()$$,
  'exact web cleanup installs the durable owner latch'
);
select lives_ok(
  $$select public.begin_own_account_deletion()$$,
  'replayed deletion begin is idempotent'
);
select is(
  public.own_account_deletion_status(),
  '{"contract":"biblequest_account_deletion_status_v1","pending":true}'::jsonb,
  'deletion status exposes only the authenticated owner latch state'
);
select throws_ok(
  $sql$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'e1000000-0000-4000-8000-000000000001/avatar-e1222222-2222-4222-8222-222222222222.webp',
      'e1000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $sql$,
  '42501',
  null,
  'the latch denies an object racing after deletion begins'
);
select throws_ok(
  $$select public.set_profile_avatar(
    'e1000000-0000-4000-8000-000000000001/avatar-e1111111-1111-4111-8111-111111111111.webp',
    'e1111111-1111-4111-8111-111111111111'
  )$$,
  '55000',
  'profile avatar: account deletion in progress',
  'a pre-latch upload cannot publish its pointer after deletion begins'
);

reset role;
set role postgres;

-- A second permissive policy must not bypass the restrictive latch guard.
create policy "test: broad avatar insert"
on storage.objects
for insert
to authenticated
with check (true);
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $sql$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'e1000000-0000-4000-8000-000000000001/avatar-e1444444-4444-4444-8444-444444444444.webp',
      'e1000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $sql$,
  '42501',
  null,
  'a broad permissive policy cannot bypass the deletion latch'
);
reset role;
set role postgres;
drop policy "test: broad avatar insert" on storage.objects;
select pg_catalog.set_config('storage.allow_delete_query', 'true', true);
select lives_ok(
  $$delete from storage.objects
    where bucket_id = 'profile-avatars'
      and name = 'e1000000-0000-4000-8000-000000000001/avatar-e1111111-1111-4111-8111-111111111111.webp'$$,
  'the Storage-service cleanup removes the latched owner object'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"e1000000-0000-4000-8000-000000000001"}',
  true
);
select lives_ok(
  $$select public.delete_own_account()$$,
  'empty-folder proof permits exact self-service deletion'
);

reset role;
set role postgres;
select is(
  (
    select pg_catalog.count(*)
    from auth.users
    where id = 'e1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'successful deletion removes the Auth identity'
);
select is(
  (
    select pg_catalog.count(*)
    from public.profiles
    where id = 'e1000000-0000-4000-8000-000000000001'
  ) + (
    select pg_catalog.count(*)
    from public.user_sync_state
    where user_id = 'e1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'successful deletion removes profile and retained sync rows'
);
select is(
  (
    select pg_catalog.count(*)
    from public.account_deletion_latches
    where user_id = 'e1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'Auth deletion cascades away the owner latch'
);
select is(
  (
    select pg_catalog.count(*)
    from storage.objects
    where bucket_id = 'profile-avatars'
      and (
        owner_id = 'e1000000-0000-4000-8000-000000000001'
        or name like
          'e1000000-0000-4000-8000-000000000001/%'
      )
  ),
  0::bigint,
  'successful deletion leaves no owner object residue'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-expected-user":"e1000000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select public.own_account_deletion_status()$$,
  '42501',
  'account deletion status: authenticated user unavailable',
  'a deleted owner JWT cannot report an active account state'
);
select throws_ok(
  $sql$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'e1000000-0000-4000-8000-000000000001/avatar-e1333333-3333-4333-8333-333333333333.webp',
      'e1000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $sql$,
  '42501',
  null,
  'a still-valid deleted-user JWT cannot recreate Storage residue'
);
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e2000000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $sql$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'e2000000-0000-4000-8000-000000000002/avatar-e2222222-2222-4222-8222-222222222222.webp',
      'e2000000-0000-4000-8000-000000000002',
      '{}'::jsonb
    )
  $sql$,
  'one deleted owner never blocks another owner upload'
);

reset role;
set role postgres;

-- Model the next PostgREST transaction after the deletion RPC clears its
-- request-local sync context, including when 0037 was applied after 0038.
select pg_catalog.set_config('biblequest.sync_expected_user', '', true);
select pg_catalog.set_config('biblequest.sync_generation', '', true);
select pg_catalog.set_config(
  'biblequest.native_account_deletion_user',
  '',
  true
);

select ok(
  pg_catalog.to_regprocedure(
    'public.adopt_web_account_protocol_v2()'
  ) is null
  and not exists (
    select 1
    from information_schema.columns as column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'user_sync_state'
      and column_record.column_name = 'web_protocol_version'
  )
  and not exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.policyname like 'web account protocol:%'
       or policy.policyname like 'profile avatars: web protocol%'
  ),
  '0038 remains deletion-only and preserves the ed28 provider boundary'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e2000000-0000-4000-8000-000000000002',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-web-auth":"v2"}',
  true
);
select is(
  (
    select pg_catalog.count(*)
    from public.profiles
    where id = 'e2000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'an unadopted owner may read with the additive v2 transport header'
);
select lives_ok(
  $sql$
    insert into public.user_guided_movements (
      user_id, session_key, content_id, movement_key, occurred_at
    ) values (
      'e2000000-0000-4000-8000-000000000002',
      'pilgrimage|pilgrimage.deletion.v1',
      'pilgrimage.deletion.v1',
      'started',
      now()
    )
  $sql$,
  'an unadopted owner may write with the additive v2 transport header'
);

reset role;
set role postgres;
select * from finish();
rollback;
