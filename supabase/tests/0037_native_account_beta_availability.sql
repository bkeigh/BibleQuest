begin;

-- Linked CLI tests enter through a restricted login; use the database owner.
set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(64);

select is(
  (
    select enabled
    from public.feature_flags
    where key = 'native_account_beta'
  ),
  false,
  'the native account beta defaults off'
);
select is(
  public.native_account_beta_availability(),
  '{"available":false,"contract":"biblequest_native_account_beta_v1"}'::jsonb,
  'the public availability response is fixed and initially unavailable'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.native_account_beta_request_allowed()',
    'EXECUTE'
  ),
  'authenticated RLS evaluation may call the sealed availability predicate'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.native_account_beta_request_allowed()',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke the internal request predicate'
);
select ok(
  (
    select relation.relrowsecurity
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
      and not has_table_privilege(
        'authenticated', relation.oid, 'SELECT'
      )
      and not has_table_privilege(
        'service_role', relation.oid, 'SELECT'
      )
    from pg_catalog.pg_class as relation
    where relation.oid = 'public.account_deletion_latches'::regclass
  ),
  'the durable owner latch is cascade-bound, forced-RLS, and sealed'
);
select ok(
  (
    select procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
      and procedure.prosrc like '%from auth.users%'
      and procedure.prosrc like '%for share%'
      and procedure.prosrc like '%account_deletion_latches%'
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure(
      'public.avatar_upload_allowed()'
    )
  )
  and (
    select policy.with_check like '%avatar_upload_allowed%'
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'profile avatars: upload own'
  )
  and (
    select policy.permissive = 'RESTRICTIVE'
      and policy.with_check like '%avatar_upload_allowed%'
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'profile avatars: account deletion guard'
  ),
  'the Storage INSERT policy holds the shared owner lock before latch checks'
);

-- Pin one restrictive policy and one security-definer trigger on every native
-- account relation so both direct reads and definer-backed writes are covered.
with expected(table_name) as (
  values
    ('profiles'),
    ('user_settings'),
    ('notification_preferences'),
    ('user_daily_quests'),
    ('user_daily_quest_days'),
    ('user_quests'),
    ('quest_completions'),
    ('prayers'),
    ('reflections'),
    ('journey_events'),
    ('growth_events'),
    ('user_milestones'),
    ('verse_bookmarks'),
    ('reading_progress'),
    ('chapters_read'),
    ('user_recent_verses'),
    ('user_guided_movements'),
    ('user_sync_state')
)
select is(
  (
    select pg_catalog.count(*)
    from expected
    join pg_catalog.pg_policies as policy
      on policy.schemaname = 'public'
     and policy.tablename = expected.table_name
     and policy.policyname = 'native account beta availability'
     and policy.permissive = 'RESTRICTIVE'
     and policy.cmd = 'ALL'
     and policy.roles = array['authenticated']::name[]
     and policy.qual like '%native_account_beta_request_allowed%'
     and policy.with_check like '%native_account_beta_request_allowed%'
  ),
  18::bigint,
  'all eighteen account relations have the restrictive native policy'
);
with expected(table_name) as (
  values
    ('profiles'),
    ('user_settings'),
    ('notification_preferences'),
    ('user_daily_quests'),
    ('user_daily_quest_days'),
    ('user_quests'),
    ('quest_completions'),
    ('prayers'),
    ('reflections'),
    ('journey_events'),
    ('growth_events'),
    ('user_milestones'),
    ('verse_bookmarks'),
    ('reading_progress'),
    ('chapters_read'),
    ('user_recent_verses'),
    ('user_guided_movements'),
    ('user_sync_state')
)
select is(
  (
    select pg_catalog.count(*)
    from expected
    join pg_catalog.pg_class as relation
      on relation.relname = expected.table_name
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
     and namespace.nspname = 'public'
    join pg_catalog.pg_trigger as trigger
      on trigger.tgrelid = relation.oid
     and trigger.tgname = 'enforce_native_account_beta_availability'
     and not trigger.tgisinternal
     and trigger.tgenabled <> 'D'
    join pg_catalog.pg_proc as procedure
      on procedure.oid = trigger.tgfoid
     and procedure.proname = 'enforce_native_account_beta_availability'
  ),
  18::bigint,
  'all eighteen account relations retain the definer-safe write trigger'
);
select is(
  (
    select pg_catalog.count(*)
    from (values
      ('public.delete_user_sync_rows(uuid,bigint,uuid,jsonb)'),
      ('public.purge_user_data(uuid,bigint,uuid)')
    ) as wrapper(signature)
    join pg_catalog.pg_proc as procedure
      on procedure.oid = pg_catalog.to_regprocedure(wrapper.signature)
    where procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
      and procedure.prosrc like '%native_account_beta_request_allowed%'
  ),
  2::bigint,
  'both destructive public RPCs check availability before replay handling'
);
select is(
  (
    select pg_catalog.count(*)
    from (values
      ('public.delete_user_sync_rows_internal(uuid,bigint,uuid,jsonb)'),
      ('public.purge_user_data_internal(uuid,bigint,uuid)')
    ) as worker(signature)
    join pg_catalog.pg_proc as procedure
      on procedure.oid = pg_catalog.to_regprocedure(worker.signature)
    where procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
      and not pg_catalog.has_function_privilege(
        'authenticated', procedure.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon', procedure.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'service_role', procedure.oid, 'EXECUTE'
      )
  ),
  2::bigint,
  'the renamed destructive workers are sealed from every API role'
);
select is(
  public.account_deletion_contract(),
  '{"contract":"generation_bound_account_deletion_v2","ready":true}'::jsonb,
  'account deletion remains ready with its user-bound native bypass'
);
select is(
  public.guided_progress_sync_contract(),
  '{"contract":"biblequest_guided_progress_sync_v1","ok":true}'::jsonb,
  'guided progress recognizes the additional restrictive policy'
);
select is(
  public.profile_avatar_contract(),
  '{"contract":"biblequest_profile_avatar_v1","ok":true}'::jsonb,
  'the avatar contract includes the sealed deletion-cleanup exception'
);

-- Two disposable owners exercise the native-off, web-compatible, and
-- native-on postures without exposing either account to the other.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('d1000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('d2000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

set local role service_role;
insert into public.prayers (
  id, user_id, body, category, status, created_at, updated_at
) values
  (
    'd1100000-0000-4000-8000-000000000011',
    'd1000000-0000-4000-8000-000000000001',
    'owner A prayer',
    'general',
    'active',
    now(),
    now()
  ),
  (
    'd2100000-0000-4000-8000-000000000021',
    'd2000000-0000-4000-8000-000000000002',
    'owner B prayer',
    'general',
    'active',
    now(),
    now()
  );
reset role;
set role postgres;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1","x-biblequest-expected-user":"d1000000-0000-4000-8000-000000000001","x-biblequest-sync-generation":"0"}',
  true
);
select throws_ok(
  $$select pg_catalog.count(*) from public.profiles$$,
  '55000',
  'native account beta is unavailable',
  'an exact beta header cannot read account rows while disabled'
);
select throws_ok(
  $sql$
    insert into public.quest_completions (id, user_id, quest_slug)
    values (
      'd1200000-0000-4000-8000-000000000012',
      'd1000000-0000-4000-8000-000000000001',
      'native-off-write'
    )
  $sql$,
  '55000',
  'native account beta is unavailable',
  'an exact beta header cannot write account rows while disabled'
);
select throws_ok(
  $$select public.account_sync_generation(
    'd1000000-0000-4000-8000-000000000001'
  )$$,
  '55000',
  'native account beta is unavailable',
  'the generation RPC fails before reading disabled native state'
);
select throws_ok(
  $$select public.replace_user_daily_quests(
    'd1000000-0000-4000-8000-000000000001',
    0,
    current_date,
    0,
    'd1300000-0000-4000-8000-000000000013',
    '[]'::jsonb
  )$$,
  '55000',
  'native account beta is unavailable',
  'daily replacement is unavailable to a disabled native client'
);
select throws_ok(
  $$select public.upsert_mutable_account_rows(
    'd1000000-0000-4000-8000-000000000001',
    0,
    'prayers',
    '[]'::jsonb
  )$$,
  '55000',
  'native account beta is unavailable',
  'mutable upsert is unavailable to a disabled native client'
);
select throws_ok(
  $$select public.delete_user_sync_rows(
    'd1000000-0000-4000-8000-000000000001',
    0,
    'd1400000-0000-4000-8000-000000000014',
    '[{"resource":"prayers","id":"d1100000-0000-4000-8000-000000000011"}]'::jsonb
  )$$,
  '55000',
  'native account beta is unavailable',
  'tombstone deletion checks availability before replay handling'
);
select throws_ok(
  $$select public.purge_user_data(
    'd1000000-0000-4000-8000-000000000001',
    0,
    'd1500000-0000-4000-8000-000000000015'
  )$$,
  '55000',
  'native account beta is unavailable',
  'Clear Data remains unavailable to a disabled native client'
);
select is(
  public.native_account_beta_availability(),
  '{"available":false,"contract":"biblequest_native_account_beta_v1"}'::jsonb,
  'the content-free availability probe remains readable while disabled'
);
reset role;
set role postgres;

-- Header absence is the existing web contract and must remain owner-scoped.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config('request.headers', '{}', true);
select is(
  (select pg_catalog.count(*) from public.profiles),
  1::bigint,
  'a web request without the beta header still reads its own profile'
);
select is(
  (select pg_catalog.count(*) from public.prayers),
  1::bigint,
  'web RLS still hides the other owner prayer'
);
select lives_ok(
  $sql$
    insert into public.quest_completions (id, user_id, quest_slug)
    values (
      'd1600000-0000-4000-8000-000000000016',
      'd1000000-0000-4000-8000-000000000001',
      'web-compatible-write'
    )
  $sql$,
  'a web request without the beta header retains its generation-zero write'
);
select is(
  public.account_sync_generation(
    'd1000000-0000-4000-8000-000000000001'
  ),
  '{"generation":0}'::jsonb,
  'a web request without the beta header retains its generation RPC'
);
reset role;
set role postgres;

update public.feature_flags
set enabled = true
where key = 'native_account_beta';

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1","x-biblequest-expected-user":"d1000000-0000-4000-8000-000000000001","x-biblequest-sync-generation":"0"}',
  true
);
select is(
  public.native_account_beta_availability(),
  '{"available":true,"contract":"biblequest_native_account_beta_v1"}'::jsonb,
  'the availability probe reports the enabled native posture'
);
select is(
  (select pg_catalog.count(*) from public.prayers),
  1::bigint,
  'an enabled native owner reads only its own prayer'
);
select lives_ok(
  $sql$
    insert into public.quest_completions (id, user_id, quest_slug)
    values (
      'd1700000-0000-4000-8000-000000000017',
      'd1000000-0000-4000-8000-000000000001',
      'native-on-write'
    )
  $sql$,
  'an enabled native owner may write at the current generation'
);
select throws_ok(
  $sql$
    insert into public.quest_completions (id, user_id, quest_slug)
    values (
      'd1800000-0000-4000-8000-000000000018',
      'd2000000-0000-4000-8000-000000000002',
      'cross-owner-write'
    )
  $sql$,
  '42501',
  null,
  'enabling native access does not weaken cross-owner RLS'
);
select is(
  public.account_sync_generation(
    'd1000000-0000-4000-8000-000000000001'
  ),
  '{"generation":0}'::jsonb,
  'an enabled native owner may read its retained generation'
);
select lives_ok(
  $sql$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'd1000000-0000-4000-8000-000000000001/avatar-d1111111-1111-4111-8111-111111111111.webp',
      'd1000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $sql$,
  'an enabled owner may insert avatar Storage before deletion begins'
);
select lives_ok(
  $$select public.set_profile_avatar(
    'd1000000-0000-4000-8000-000000000001/avatar-d1111111-1111-4111-8111-111111111111.webp',
    'd1111111-1111-4111-8111-111111111111'
  )$$,
  'the avatar pointer may publish before the deletion latch exists'
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1","x-biblequest-account-deletion-cleanup":"v1"}',
  true
);
select throws_ok(
  $$select public.begin_own_account_deletion()$$,
  '42501',
  'account deletion: invalid begin request',
  'deletion begin requires a caller-captured expected owner'
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1","x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"d2000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select public.begin_own_account_deletion()$$,
  '42501',
  'account deletion: invalid begin request',
  'deletion begin cannot latch the caller under another expected owner'
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v2","x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"d1000000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select public.begin_own_account_deletion()$$,
  '42501',
  'account deletion: invalid begin request',
  'a present native marker must be exact before deletion can begin'
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"d1000000-0000-4000-8000-000000000001"}',
  true
);
select lives_ok(
  $$select public.begin_own_account_deletion()$$,
  'an authenticated web cleanup may durably begin without a native marker'
);
select lives_ok(
  $$select public.begin_own_account_deletion()$$,
  'replaying deletion begin for the same owner is idempotent'
);
reset role;
set role postgres;

select is(
  (
    select pg_catalog.count(*)
    from public.account_deletion_latches
    where user_id = 'd1000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'begin persists exactly one durable latch for its authenticated owner'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1","x-biblequest-expected-user":"d1000000-0000-4000-8000-000000000001","x-biblequest-sync-generation":"0"}',
  true
);
select throws_ok(
  $$select public.delete_own_account()$$,
  '55000',
  'account deletion: avatar cleanup incomplete',
  'direct account deletion cannot orphan an unswept avatar object'
);
select throws_ok(
  $sql$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'd1000000-0000-4000-8000-000000000001/avatar-d1222222-2222-4222-8222-222222222222.webp',
      'd1000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $sql$,
  '42501',
  null,
  'Storage denies every later avatar insert after deletion begins'
);
select throws_ok(
  $$select public.set_profile_avatar(
    'd1000000-0000-4000-8000-000000000001/avatar-d1111111-1111-4111-8111-111111111111.webp',
    'd1111111-1111-4111-8111-111111111111'
  )$$,
  '55000',
  'profile avatar: account deletion in progress',
  'the pointer RPC cannot publish an earlier upload after deletion begins'
);
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd2000000-0000-4000-8000-000000000002',
  true
);
select pg_catalog.set_config('request.headers', '{}', true);
select lives_ok(
  $sql$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'profile-avatars',
      'd2000000-0000-4000-8000-000000000002/avatar-d2222222-2222-4222-8222-222222222222.webp',
      'd2000000-0000-4000-8000-000000000002',
      '{}'::jsonb
    )
  $sql$,
  'one owner deletion latch does not block another owner avatar upload'
);
reset role;
set role postgres;

-- A third owner proves that disabling sync never disables verified erasure.
select pg_catalog.set_config('request.headers', '{}', true);
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values (
  'd3000000-0000-4000-8000-000000000003',
  '{}'::jsonb,
  now(),
  now()
);
set local role service_role;
update public.profiles
set
  avatar_path =
    'd3000000-0000-4000-8000-000000000003/avatar-d3333333-3333-4333-8333-333333333333.webp',
  avatar_version = 'd3333333-3333-4333-8333-333333333333',
  avatar_updated_at = now()
where id = 'd3000000-0000-4000-8000-000000000003';
insert into public.prayers (
  id, user_id, body, category, status, created_at, updated_at
) values (
  'd3100000-0000-4000-8000-000000000031',
  'd3000000-0000-4000-8000-000000000003',
  'deletion owner prayer',
  'general',
  'active',
  now(),
  now()
);
reset role;
set role postgres;
update public.feature_flags
set enabled = false
where key = 'native_account_beta';

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd3000000-0000-4000-8000-000000000003',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1"}',
  true
);
select throws_ok(
  $$select public.clear_profile_avatar(
    'd3000000-0000-4000-8000-000000000003/avatar-d3333333-3333-4333-8333-333333333333.webp'
  )$$,
  '55000',
  'native account beta is unavailable',
  'ordinary avatar pointer cleanup remains blocked while disabled'
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1","x-biblequest-account-deletion-cleanup":"v2","x-biblequest-expected-user":"d3000000-0000-4000-8000-000000000003"}',
  true
);
select throws_ok(
  $$select public.clear_profile_avatar(
    'd3000000-0000-4000-8000-000000000003/avatar-d3333333-3333-4333-8333-333333333333.webp'
  )$$,
  '42501',
  'profile avatar: invalid deletion cleanup',
  'an inexact deletion-cleanup marker fails closed'
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-account-deletion-cleanup":"v1"}',
  true
);
select throws_ok(
  $$select public.clear_profile_avatar(null)$$,
  '42501',
  'profile avatar: invalid deletion cleanup',
  'deletion cleanup also requires the caller-captured expected owner'
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1","x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"d3000000-0000-4000-8000-000000000003"}',
  true
);
select lives_ok(
  $$select public.begin_own_account_deletion()$$,
  'exact native deletion may durably begin while the beta is disabled'
);
select throws_ok(
  $$select public.native_account_beta_request_allowed()$$,
  '55000',
  'native account beta is unavailable',
  'the general availability predicate ignores the deletion-cleanup marker'
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"d3000000-0000-4000-8000-000000000003"}',
  true
);
select is(
  (
    public.clear_profile_avatar(
      null
    )->>'cleared'
  )::boolean,
  true,
  'web cleanup clears the latched owner pointer without a native marker'
);
select is(
  pg_catalog.current_setting(
    'biblequest.native_account_deletion_user',
    true
  ),
  '',
  'avatar cleanup clears its transaction-local bypass before returning'
);
reset role;
set role postgres;
select is(
  (
    select avatar_path
    from public.profiles
    where id = 'd3000000-0000-4000-8000-000000000003'
  ),
  null,
  'the deletion cleanup removes the pointer without deleting the profile'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd3000000-0000-4000-8000-000000000003',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1"}',
  true
);
select lives_ok(
  $$select public.delete_own_account()$$,
  'verified self-service account deletion remains available while disabled'
);
reset role;
set role postgres;

select is(
  (
    select pg_catalog.count(*)
    from auth.users
    where id = 'd3000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'disabled-state deletion removes only the current Auth identity'
);
select is(
  (
    select pg_catalog.count(*)
    from public.profiles
    where id = 'd3000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'disabled-state deletion removes the current profile'
);
select is(
  (
    select pg_catalog.count(*)
    from public.prayers
    where user_id = 'd3000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'disabled-state deletion removes the current journey rows'
);
select is(
  (
    select pg_catalog.count(*)
    from public.user_sync_state
    where user_id = 'd3000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'disabled-state deletion removes retained sync state'
);
select is(
  (
    select pg_catalog.count(*)
    from public.account_deletion_latches
    where user_id = 'd3000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'Auth deletion cascades away the durable owner latch'
);
select is(
  (
    select pg_catalog.count(*)
    from auth.users
    where id in (
      'd1000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000002'
    )
  ),
  2::bigint,
  'disabled-state deletion preserves unrelated accounts'
);
select is(
  pg_catalog.current_setting(
    'biblequest.native_account_deletion_user',
    true
  ),
  '',
  'the deletion-only bypass is cleared before the RPC returns'
);
select is(
  (
    select enabled
    from public.feature_flags
    where key = 'native_account_beta'
  ),
  false,
  'the test leaves the remotely controlled beta disabled'
);

-- Supported Clear Journey may leave Auth without a profile, and resilient
-- deletion must also repair a missing retained sync-state row.
set role postgres;
select pg_catalog.set_config('request.headers', '{}', true);
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
select pg_catalog.set_config('biblequest.sync_expected_user', '', true);
select pg_catalog.set_config('biblequest.sync_generation', '', true);
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values (
  'd4000000-0000-4000-8000-000000000004',
  '{}'::jsonb,
  now(),
  now()
);
set local role service_role;
delete from public.profiles
where id = 'd4000000-0000-4000-8000-000000000004';
delete from public.user_sync_state
where user_id = 'd4000000-0000-4000-8000-000000000004';
reset role;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd4000000-0000-4000-8000-000000000004',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-native-account-beta":"v1","x-biblequest-account-deletion-cleanup":"v1","x-biblequest-expected-user":"d4000000-0000-4000-8000-000000000004"}',
  true
);
select lives_ok(
  $$select public.begin_own_account_deletion()$$,
  'a profile-less account may begin exact deletion cleanup while disabled'
);
select is(
  (public.clear_profile_avatar(null)->>'cleared')::boolean,
  true,
  'deletion cleanup tolerates an already-removed profile'
);
reset role;
set role postgres;
select is(
  (
    select pg_catalog.count(*)
    from public.user_sync_state
    where user_id = 'd4000000-0000-4000-8000-000000000004'
  ),
  1::bigint,
  'deletion cleanup repairs only the caller retained sync state'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd4000000-0000-4000-8000-000000000004',
  true
);
select lives_ok(
  $$select public.delete_own_account()$$,
  'a profile-less account remains eligible for resilient self-deletion'
);
reset role;
set role postgres;
select is(
  (
    select pg_catalog.count(*)
    from auth.users
    where id = 'd4000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'profile-less deletion removes the authenticated identity'
);

select * from finish();
rollback;
