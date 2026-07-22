begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(51);

-- Pin the retained generation table and its intentionally narrow read surface.
select has_table('public', 'user_sync_state', 'retained sync state exists');
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.user_sync_state'::regclass),
  'retained sync state has RLS enabled'
);
select ok(
  has_column_privilege(
    'authenticated', 'public.user_sync_state', 'generation', 'SELECT'
  ),
  'authenticated users may read their generation'
);
select ok(
  not has_column_privilege(
    'authenticated', 'public.user_sync_state', 'request_history', 'SELECT'
  ),
  'idempotency history is not exposed to authenticated clients'
);

-- Pin all public wrappers, their grants, and the private worker posture.
select is(
  (select count(*)
   from (values
     ('public.account_sync_generation(uuid)'),
     ('public.replace_user_daily_quests(uuid,bigint,date,bigint,uuid,jsonb)'),
     ('public.upsert_mutable_account_rows(uuid,bigint,text,jsonb)'),
     ('public.delete_user_sync_rows(uuid,bigint,uuid,jsonb)'),
     ('public.purge_user_data(uuid,bigint,uuid)')
   ) as wrapper(signature)
   where to_regprocedure(wrapper.signature) is not null),
  5::bigint,
  'all five identity- and generation-bound wrappers exist'
);
select ok(
  to_regprocedure(
    'public.replace_user_daily_quests(date,bigint,uuid,jsonb)'
  ) is null,
  'the unbound daily replacement signature is retired'
);
select ok(
  to_regprocedure(
    'public.upsert_mutable_account_rows(text,jsonb)'
  ) is null,
  'the unbound mutable-write signature is retired'
);
select ok(
  to_regprocedure('public.purge_user_data()') is null,
  'the unbound purge signature is retired'
);
select is(
  (select count(*)
   from (values
     ('public.account_sync_generation(uuid)'),
     ('public.replace_user_daily_quests(uuid,bigint,date,bigint,uuid,jsonb)'),
     ('public.upsert_mutable_account_rows(uuid,bigint,text,jsonb)'),
     ('public.delete_user_sync_rows(uuid,bigint,uuid,jsonb)'),
     ('public.purge_user_data(uuid,bigint,uuid)')
   ) as wrapper(signature)
   join pg_catalog.pg_proc as procedure
     on procedure.oid = to_regprocedure(wrapper.signature)
   where procedure.prosecdef
     and procedure.proconfig = array['search_path=""']::text[]),
  5::bigint,
  'all public wrappers are hardened security-definer functions'
);
select is(
  (select count(*)
   from (values
     ('public.account_sync_generation(uuid)'),
     ('public.replace_user_daily_quests(uuid,bigint,date,bigint,uuid,jsonb)'),
     ('public.upsert_mutable_account_rows(uuid,bigint,text,jsonb)'),
     ('public.delete_user_sync_rows(uuid,bigint,uuid,jsonb)'),
     ('public.purge_user_data(uuid,bigint,uuid)')
   ) as wrapper(signature)
   where has_function_privilege('authenticated', wrapper.signature, 'EXECUTE')),
  5::bigint,
  'authenticated clients may execute every public wrapper'
);
select is(
  (select count(*)
   from (values
     ('public.account_sync_generation(uuid)'),
     ('public.replace_user_daily_quests(uuid,bigint,date,bigint,uuid,jsonb)'),
     ('public.upsert_mutable_account_rows(uuid,bigint,text,jsonb)'),
     ('public.delete_user_sync_rows(uuid,bigint,uuid,jsonb)'),
     ('public.purge_user_data(uuid,bigint,uuid)')
   ) as wrapper(signature)
   where has_function_privilege('anon', wrapper.signature, 'EXECUTE')),
  0::bigint,
  'anonymous clients cannot execute any public wrapper'
);
select is(
  (select count(*)
   from (values
     ('public.replace_user_daily_quests_internal(date,bigint,uuid,jsonb)'),
     ('public.upsert_mutable_account_rows_internal(text,jsonb)'),
     ('public.purge_user_data_internal()')
   ) as worker(signature)
   join pg_catalog.pg_proc as procedure
     on procedure.oid = to_regprocedure(worker.signature)
   where not procedure.prosecdef
     and not has_function_privilege(
       'authenticated', procedure.oid, 'EXECUTE'
     )
     and not has_function_privilege('anon', procedure.oid, 'EXECUTE')),
  3::bigint,
  'all internal workers are invoker-only and browser-inaccessible'
);
select is(
  (select count(*) from pg_catalog.pg_trigger as trigger
   join pg_catalog.pg_proc as procedure on procedure.oid = trigger.tgfoid
   where trigger.tgname = 'enforce_user_sync_generation'
     and not trigger.tgisinternal and trigger.tgenabled <> 'D'
     and procedure.proname = 'enforce_user_sync_generation'),
  16::bigint,
  'all sixteen synced tables enforce the retained generation'
);
select is(
  (select count(*)
   from (values
     ('public.profiles'), ('public.user_settings'),
     ('public.notification_preferences'), ('public.prayers'),
     ('public.reflections'), ('public.user_quests'),
     ('public.reading_progress')
   ) as boundary(table_name)
   where has_table_privilege(
     'authenticated', boundary.table_name, 'UPDATE'
   )),
  0::bigint,
  'all seven mutable resources require the guarded update RPC'
);
select is(
  (select count(*)
   from (values
     ('public.prayers'), ('public.reflections'),
     ('public.verse_bookmarks'), ('public.user_quests'),
     ('public.user_recent_verses')
   ) as boundary(table_name)
   where has_table_privilege(
     'authenticated', boundary.table_name, 'DELETE'
   )),
  0::bigint,
  'all five tombstone resources require the bounded delete RPC'
);

-- Preserve exact bounded readiness responses across all three contract levels.
select is(
  public.daily_quest_sync_contract(),
  '{"contract":"biblequest_daily_quest_sync_v1","ok":true}'::jsonb,
  'v1 readiness remains exact and true for the six-argument CAS wrapper'
);
select is(
  public.mutable_account_sync_contract(),
  '{"contract":"biblequest_mutable_account_sync_v2","ok":true}'::jsonb,
  'v2 readiness remains exact and includes both new mutable resources'
);
select is(
  public.account_sync_contract(),
  '{"contract":"biblequest_account_sync_v4","ok":true}'::jsonb,
  'v4 readiness is exact and true'
);
set local role service_role;
select is(
  public.account_sync_contract(),
  '{"contract":"biblequest_account_sync_v4","ok":true}'::jsonb,
  'service role receives only the same bounded v4 readiness response'
);
reset role;

-- Create two disposable identities; the signup trigger must seed state first.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('81000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('82000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '82000000-0000-4000-8000-000000000002',
  true
);
set local role service_role;
insert into public.prayers (
  id, user_id, body, category, status, created_at, updated_at
) values (
  '82900000-0000-4000-8000-000000000009',
  '82000000-0000-4000-8000-000000000002',
  'other owner prayer', 'general', 'active', now(), now()
);
reset role;
set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select generation from public.user_sync_state),
  0::bigint,
  'the signup trigger exposes generation zero to the owner'
);
select is(
  public.account_sync_generation(
    '81000000-0000-4000-8000-000000000001'
  ),
  '{"generation":0}'::jsonb,
  'the identity-bound generation RPC returns exactly one generation field'
);
select throws_ok(
  $$select public.account_sync_generation(
    '82000000-0000-4000-8000-000000000002'
  )$$,
  '42501',
  'account sync: authenticated user changed',
  'the generation RPC rejects a captured-user mismatch'
);

-- Service setup can seed owner rows without reopening browser mutations.
set local role service_role;
insert into public.prayers (
  id, user_id, body, category, status, created_at, updated_at
) values (
  '81100000-0000-4000-8000-000000000011',
  '81000000-0000-4000-8000-000000000001',
  'owner prayer', 'general', 'active', now(), now()
);
reset role;
set local role authenticated;
select is(
  (select count(*) from public.prayers
   where id = '81100000-0000-4000-8000-000000000011'),
  1::bigint,
  'a service-seeded owner row is visible at generation zero'
);

-- Every security-definer write binds both the captured user and generation.
select throws_ok(
  $$select public.upsert_mutable_account_rows(
    '82000000-0000-4000-8000-000000000002', 0, 'prayers', '[]'::jsonb
  )$$,
  '42501',
  'account sync: authenticated user changed',
  'a wrapper rejects an expected-user mismatch'
);
select throws_ok(
  $$select public.upsert_mutable_account_rows(
    '81000000-0000-4000-8000-000000000001', 1, 'prayers', '[]'::jsonb
  )$$,
  '40001',
  'account sync: stale generation',
  'a wrapper rejects a stale expected generation'
);
select throws_ok(
  $$select public.delete_user_sync_rows(
    '81000000-0000-4000-8000-000000000001', null,
    '81900000-0000-4000-8000-000000000019',
    '[{"resource":"prayers","id":"81100000-0000-4000-8000-000000000011"}]'::jsonb
  )$$,
  '22023',
  'account sync: invalid generation',
  'the delete wrapper rejects a missing expected generation'
);
select throws_ok(
  $$select public.purge_user_data(
    '81000000-0000-4000-8000-000000000001', -1,
    '81900000-0000-4000-8000-000000000019'
  )$$,
  '22023',
  'account sync: invalid generation',
  'the purge wrapper rejects a negative expected generation'
);

-- A completed local profile may claim only the untouched signup scaffold.
select is(
  public.upsert_mutable_account_rows(
    '81000000-0000-4000-8000-000000000001', 0, 'profiles',
    '[{"expected_revision":1,"row":{"display_name":"Claimed owner","tradition":"baptist","primary_goal":"prayer","calling":null,"daily_rhythm":"morning","quest_style":"guided","onboarding_completed":true,"created_at":"2025-07-22T20:00:00Z","updated_at":"2025-07-22T20:00:00Z"}}]'::jsonb
  ),
  '{"generation":0,"results":[{"key":{"id":"81000000-0000-4000-8000-000000000001"},"status":"applied","revision":2}]}'::jsonb,
  'an onboarded local profile safely claims a blank scaffold'
);
select is(
  (select tradition from public.profiles
   where id = '81000000-0000-4000-8000-000000000001'),
  'baptist',
  'the safe scaffold claim persists the onboarding profile'
);

-- Shelf and reading progress use deterministic last-write guards.
select is(
  public.upsert_mutable_account_rows(
    '81000000-0000-4000-8000-000000000001', 0, 'user_quests',
    '[{"expected_revision":0,"row":{"quest_slug":"walk-faith","status":"active","steps_done":[],"times_completed":0,"added_at":"2026-07-22T20:00:00Z","started_at":null,"paused_at":null,"completed_at":null,"archived_at":null,"last_activity_at":"2026-07-22T20:00:00Z"}}]'::jsonb
  ),
  '{"generation":0,"results":[{"key":{"quest_slug":"walk-faith"},"status":"applied","revision":1}]}'::jsonb,
  'the shelf guard accepts a current row'
);
select is(
  public.upsert_mutable_account_rows(
    '81000000-0000-4000-8000-000000000001', 0, 'user_quests',
    '[{"expected_revision":1,"row":{"quest_slug":"walk-faith","status":"archived","steps_done":[],"times_completed":0,"added_at":"2026-07-22T20:00:00Z","started_at":null,"paused_at":null,"completed_at":null,"archived_at":null,"last_activity_at":"2026-07-22T19:59:59Z"}}]'::jsonb
  ),
  '{"generation":0,"results":[{"key":{"quest_slug":"walk-faith"},"status":"applied","revision":2}]}'::jsonb,
  'the shelf guard accepts the current revision despite an older clock'
);
select is(
  (select status from public.user_quests where quest_slug = 'walk-faith'),
  'archived',
  'the revision-authorized shelf row becomes canonical'
);
select is(
  public.upsert_mutable_account_rows(
    '81000000-0000-4000-8000-000000000001', 0, 'reading_progress',
    '[{"expected_revision":0,"row":{"book_slug":"john","book_name":"John","chapter":3,"updated_at":"2026-07-22T20:00:00Z"}}]'::jsonb
  ),
  '{"generation":0,"results":[{"key":{"user_id":"81000000-0000-4000-8000-000000000001"},"status":"applied","revision":1}]}'::jsonb,
  'the reading guard accepts a current row'
);
select is(
  public.upsert_mutable_account_rows(
    '81000000-0000-4000-8000-000000000001', 0, 'reading_progress',
    '[{"expected_revision":1,"row":{"book_slug":"genesis","book_name":"Genesis","chapter":1,"updated_at":"2026-07-22T19:59:59Z"}}]'::jsonb
  ),
  '{"generation":0,"results":[{"key":{"user_id":"81000000-0000-4000-8000-000000000001"},"status":"applied","revision":2}]}'::jsonb,
  'the reading guard accepts the current revision despite an older clock'
);
select is(
  (select book_slug from public.reading_progress),
  'genesis',
  'the revision-authorized reading row becomes canonical'
);

-- Seed all remaining tombstone types through the service setup role.
set local role service_role;
insert into public.reflections (
  id, user_id, body, created_at, updated_at
) values (
  '81200000-0000-4000-8000-000000000012',
  '81000000-0000-4000-8000-000000000001',
  'owner reflection', now(), now()
);
insert into public.verse_bookmarks (
  user_id, book_slug, book_name, chapter, verse, text, translation_key
) values (
  '81000000-0000-4000-8000-000000000001',
  'john', 'John', 3, 16, 'For God so loved', 'web'
);
insert into public.user_recent_verses (
  user_id, book_slug, book_name, chapter, verse_start, verse_end,
  reference, text, viewed_at
) values (
  '81000000-0000-4000-8000-000000000001',
  'psalms', 'Psalms', 23, 1, 2, 'Psalm 23:1-2', 'The Lord', now()
);
reset role;
set local role authenticated;

-- One bounded tombstone batch is owner-scoped, atomic, and bumps generation.
select is(
  public.delete_user_sync_rows(
    '81000000-0000-4000-8000-000000000001', 0,
    '81300000-0000-4000-8000-000000000013',
    '[{"resource":"prayers","id":"81100000-0000-4000-8000-000000000011"},{"resource":"reflections","id":"81200000-0000-4000-8000-000000000012"},{"resource":"bookmarks","book_slug":"john","chapter":3,"verse":16,"translation_key":"web"},{"resource":"user_quests","quest_slug":"walk-faith"},{"resource":"recent_verses","book_slug":"psalms","chapter":23,"verse_start":1,"verse_end":2},{"resource":"prayers","id":"82900000-0000-4000-8000-000000000009"}]'::jsonb
  ),
  '{"deleted":5,"generation":1,"duplicate":false}'::jsonb,
  'the bounded delete removes only five owner rows and advances generation'
);
select is(
  (select count(*) from (
    select id::text as key from public.prayers
    union all select id::text from public.reflections
    union all select book_slug from public.verse_bookmarks
    union all select quest_slug from public.user_quests
    union all select book_slug from public.user_recent_verses
  ) as remaining),
  0::bigint,
  'all requested owner tombstones are absent'
);
select set_config(
  'request.jwt.claim.sub',
  '82000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from public.prayers
   where id = '82900000-0000-4000-8000-000000000009'),
  1::bigint,
  'a tombstone cannot delete another owner row'
);
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select generation from public.user_sync_state),
  1::bigint,
  'the retained generation advanced exactly once'
);
select is(
  public.delete_user_sync_rows(
    '81000000-0000-4000-8000-000000000001', 0,
    '81300000-0000-4000-8000-000000000013',
    '[{"resource":"prayers","id":"81100000-0000-4000-8000-000000000011"},{"resource":"reflections","id":"81200000-0000-4000-8000-000000000012"},{"resource":"bookmarks","book_slug":"john","chapter":3,"verse":16,"translation_key":"web"},{"resource":"user_quests","quest_slug":"walk-faith"},{"resource":"recent_verses","book_slug":"psalms","chapter":23,"verse_start":1,"verse_end":2},{"resource":"prayers","id":"82900000-0000-4000-8000-000000000009"}]'::jsonb
  ),
  '{"deleted":0,"generation":1,"duplicate":true}'::jsonb,
  'an exact tombstone retry returns its original generation'
);
select is(
  (select generation from public.user_sync_state),
  1::bigint,
  'an exact retry does not advance generation again'
);
select throws_ok(
  $$select public.delete_user_sync_rows(
    '81000000-0000-4000-8000-000000000001', 1,
    '81300000-0000-4000-8000-000000000013',
    '[{"resource":"prayers","id":"81900000-0000-4000-8000-000000000019"}]'::jsonb
  )$$,
  '22023',
  'delete_user_sync_rows: request id reused',
  'a tombstone request id cannot be reused with different content'
);
select throws_ok(
  $$select public.delete_user_sync_rows(
    '81000000-0000-4000-8000-000000000001', 1,
    '81400000-0000-4000-8000-000000000014',
    (select jsonb_agg(jsonb_build_object(
      'resource', 'prayers', 'id', gen_random_uuid()
    )) from generate_series(1, 201))
  )$$,
  '22023',
  'delete_user_sync_rows: invalid deletions',
  'a tombstone batch cannot exceed two hundred entries'
);

-- Once generation advances, cached headerless writes fail closed.
select set_config('biblequest.sync_expected_user', '', true);
select set_config('biblequest.sync_generation', '', true);
select set_config('request.headers', '{}', true);
select throws_ok(
  $$insert into public.prayers (
      id, user_id, body, category, status, created_at, updated_at
    ) values (
      '81500000-0000-4000-8000-000000000015',
      '81000000-0000-4000-8000-000000000001',
      'cached stale prayer', 'general', 'active', now(), now()
    )$$,
  '42501',
  null,
  'a headerless cached write fails after generation advances'
);
select set_config(
  'request.headers',
  '{"x-biblequest-expected-user":"81000000-0000-4000-8000-000000000001","x-biblequest-sync-generation":"1"}',
  true
);
select throws_ok(
  $$insert into public.prayers (
      id, user_id, body, category, status, created_at, updated_at
    ) values (
      '81600000-0000-4000-8000-000000000016',
      '81000000-0000-4000-8000-000000000001',
      'current header prayer', 'general', 'active', now(), now()
    )$$,
  '42501',
  null,
  'current generation headers cannot bypass the v4 CAS RPC'
);
select is(
  (select count(*) from public.prayers
   where id = '81600000-0000-4000-8000-000000000016'),
  0::bigint,
  'the denied current-header write leaves no row'
);
select set_config(
  'request.headers',
  '{"x-biblequest-expected-user":"81000000-0000-4000-8000-000000000001","x-biblequest-sync-generation":"0"}',
  true
);
select throws_ok(
  $$insert into public.prayers (
      id, user_id, body, category, status, created_at, updated_at
    ) values (
      '81700000-0000-4000-8000-000000000017',
      '81000000-0000-4000-8000-000000000001',
      'old header prayer', 'general', 'active', now(), now()
    )$$,
  '42501',
  null,
  'a direct write with an old generation header fails at the grant boundary'
);

-- Purge retains sync state, advances once, and has an idempotent retry.
select set_config('request.headers', '{}', true);
select is(
  public.purge_user_data(
    '81000000-0000-4000-8000-000000000001', 1,
    '81800000-0000-4000-8000-000000000018'
  ),
  '{"generation":2,"duplicate":false}'::jsonb,
  'purge advances generation after deleting the account journey'
);
select is(
  (select count(*) from public.profiles
   where id = '81000000-0000-4000-8000-000000000001'),
  0::bigint,
  'purge removes the owner profile'
);
select is(
  (select generation from public.user_sync_state),
  2::bigint,
  'purge retains sync state at the next generation'
);
select is(
  public.purge_user_data(
    '81000000-0000-4000-8000-000000000001', 1,
    '81800000-0000-4000-8000-000000000018'
  ),
  '{"generation":2,"duplicate":true}'::jsonb,
  'an exact purge retry is idempotent'
);

reset role;
select * from finish();
rollback;
