begin;

-- Linked CLI tests enter through a restricted login; use the database owner.
set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

-- Pin the nine server-owned revision columns and their trigger authority.
select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name in (
       'profiles', 'user_settings', 'notification_preferences', 'prayers',
       'reflections', 'user_quests', 'reading_progress', 'verse_bookmarks',
       'user_recent_verses'
     )
     and column_name = 'sync_revision'
     and is_nullable = 'NO'
     and column_default = '1'),
  9::bigint,
  'all nine conflict-bearing resources expose a non-null revision'
);
select is(
  (select count(*)
   from pg_catalog.pg_trigger as trigger
   join pg_catalog.pg_proc as procedure on procedure.oid = trigger.tgfoid
   where trigger.tgname = 'advance_account_sync_revision'
     and not trigger.tgisinternal and trigger.tgenabled <> 'D'
     and procedure.proname = 'advance_account_sync_revision'),
  9::bigint,
  'all nine resources advance revisions with the private trigger'
);
select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'user_recent_verses'
     and column_name = 'server_seen_at'
     and data_type = 'timestamp with time zone'
     and is_nullable = 'NO'
     and column_default = 'now()'),
  1::bigint,
  'recent verses expose one non-null server-order timestamp'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.user_recent_verses'::regclass
      and tgname = 'keep_newest_recent_verse'
      and not tgisinternal and tgenabled <> 'D'
  ),
  'the client-clock recent-verse trigger is retired'
);
select is(
  (select count(*)
   from (values
     ('profiles'), ('user_settings'), ('notification_preferences'),
     ('prayers'), ('reflections'), ('user_quests'), ('reading_progress'),
     ('verse_bookmarks'), ('user_recent_verses')
   ) as resource(table_name)
   where has_table_privilege(
     'authenticated', 'public.' || resource.table_name,
     'INSERT,UPDATE,DELETE'
   )),
  0::bigint,
  'authenticated clients have no direct mutation grant on any CAS resource'
);
select is(
  public.account_sync_contract(),
  '{"contract":"biblequest_account_sync_v4","ok":true}'::jsonb,
  'the exact v4 account contract is live'
);
select is(
  (select count(*) from jsonb_object_keys(public.account_sync_contract())),
  2::bigint,
  'the v4 readiness response remains content-free'
);

-- Create two disposable owners; the signup scaffold starts at revision one.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('91000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('92000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);

-- Cached v3 rows and malformed revision envelopes fail before mutation.
select throws_ok(
  $$select public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'prayers',
      '[{"id":"91100000-0000-4000-8000-000000000011"}]'::jsonb
    )$$,
  '22023',
  'upsert_mutable_account_rows: invalid revision envelope',
  'a cached v3 bare row fails closed'
);
select throws_ok(
  $$select public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'prayers',
      '[{"expected_revision":-1,"row":{}}]'::jsonb
    )$$,
  '22023',
  'upsert_mutable_account_rows: invalid revision envelope',
  'negative revisions fail closed'
);
select throws_ok(
  $$select public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'prayers',
      '[{"expected_revision":0,"row":{},"extra":true}]'::jsonb
    )$$,
  '22023',
  'upsert_mutable_account_rows: invalid revision envelope',
  'extra envelope keys fail closed'
);
select throws_ok(
  $$select public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0,
      'user_recent_verses',
      '[{"expected_revision":0,"row":{"book_slug":"psalms","book_name":"Psalms","chapter":23,"verse_start":1,"verse_end":2,"reference":"Psalm 23:1-2","text":"The Lord","viewed_at":"2026-07-22T20:00:00Z","server_seen_at":"2026-07-22T20:00:00Z"}}]'::jsonb
    )$$,
  '22023',
  'upsert_mutable_account_rows: invalid recent verse row',
  'clients cannot submit the server-owned recent-verse order'
);
select throws_ok(
  $$select public.upsert_mutable_account_rows(
      '92000000-0000-4000-8000-000000000002', 0, 'prayers', '[]'::jsonb
    )$$,
  '42501',
  'account sync: authenticated user changed',
  'the wrapper rejects a captured-user mismatch'
);
select throws_ok(
  $$select public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 1, 'prayers', '[]'::jsonb
    )$$,
  '40001',
  'account sync: stale generation',
  'the wrapper rejects a stale generation'
);
select throws_ok(
  $$insert into public.prayers (
      id, user_id, body, category, status, created_at, updated_at
    ) values (
      '91900000-0000-4000-8000-000000000019',
      '91000000-0000-4000-8000-000000000001',
      'direct', 'general', 'active', now(), now()
    )$$,
  '42501',
  null,
  'an actual direct insert is denied'
);

-- The signup profile uses revision one; clocks never decide its CAS result.
create temporary table revision_results (
  name text primary key,
  acknowledgement jsonb not null
) on commit drop;
insert into revision_results values (
  'profile-future',
  public.upsert_mutable_account_rows(
    '91000000-0000-4000-8000-000000000001', 0, 'profiles',
    '[{"expected_revision":1,"row":{"display_name":"Future profile","tradition":null,"primary_goal":null,"calling":null,"daily_rhythm":null,"quest_style":null,"onboarding_completed":true,"created_at":"2026-07-22T20:00:00Z","updated_at":"2026-07-23T20:00:00Z"}}]'::jsonb
  )
);
select is(
  (select acknowledgement from revision_results where name = 'profile-future'),
  '{"generation":0,"results":[{"key":{"id":"91000000-0000-4000-8000-000000000001"},"status":"applied","revision":2}]}'::jsonb,
  'a matching profile revision applies a plus-24-hour payload'
);
insert into revision_results values (
  'profile-stale',
  public.upsert_mutable_account_rows(
    '91000000-0000-4000-8000-000000000001', 0, 'profiles',
    '[{"expected_revision":1,"row":{"display_name":"Stale profile","tradition":null,"primary_goal":null,"calling":null,"daily_rhythm":null,"quest_style":null,"onboarding_completed":true,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:00Z"}}]'::jsonb
  )
);
select is(
  (select acknowledgement from revision_results where name = 'profile-stale'),
  '{"generation":0,"results":[{"key":{"id":"91000000-0000-4000-8000-000000000001"},"status":"conflict","revision":2}]}'::jsonb,
  'a stale profile revision conflicts despite a later clock'
);
select is(
  (select display_name from public.profiles),
  'Future profile',
  'the stale clock cannot replace profile content'
);
insert into revision_results values (
  'profile-past',
  public.upsert_mutable_account_rows(
    '91000000-0000-4000-8000-000000000001', 0, 'profiles',
    '[{"expected_revision":2,"row":{"display_name":"Past profile","tradition":null,"primary_goal":null,"calling":null,"daily_rhythm":null,"quest_style":null,"onboarding_completed":true,"created_at":"2026-07-22T20:00:00Z","updated_at":"2026-07-21T20:00:00Z"}}]'::jsonb
  )
);
select is(
  (select acknowledgement from revision_results where name = 'profile-past'),
  '{"generation":0,"results":[{"key":{"id":"91000000-0000-4000-8000-000000000001"},"status":"applied","revision":3}]}'::jsonb,
  'a current profile revision applies a minus-24-hour payload'
);

-- Exercise singleton settings and notification insert revisions.
insert into revision_results values
  (
    'settings',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'user_settings',
      '[{"expected_revision":0,"row":{"theme":"dark","reduced_motion":false,"text_size":"default","quest_duration_pref":[],"quest_category_pref":[],"language":"en","preferred_bible_translation":"kjv","analytics_consent":false,"updated_at":"2026-07-22T20:00:00Z"}}]'::jsonb
    )
  ),
  (
    'notifications',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0,
      'notification_preferences',
      '[{"expected_revision":0,"row":{"daily_verse_enabled":true,"daily_quest_enabled":false,"prayer_reminders_enabled":false,"weekly_recap_enabled":true,"preferred_time":"08:00","updated_at":"2026-07-22T20:00:00Z"}}]'::jsonb
    )
  );
select is(
  (select acknowledgement->'results'->0->>'status'
   from revision_results where name = 'settings'),
  'applied',
  'settings insert through revision zero'
);
select is(
  (select acknowledgement->'results'->0->>'status'
   from revision_results where name = 'notifications'),
  'applied',
  'notification preferences insert through revision zero'
);

-- A prayer batch may partially apply, and every outcome is attributable.
insert into revision_results values (
  'prayer-insert',
  public.upsert_mutable_account_rows(
    '91000000-0000-4000-8000-000000000001', 0, 'prayers',
    '[{"expected_revision":0,"row":{"id":"91100000-0000-4000-8000-000000000011","title":null,"body":"First","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2026-07-22T20:00:00Z"}},{"expected_revision":0,"row":{"id":"91200000-0000-4000-8000-000000000012","title":null,"body":"Second","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2026-07-22T20:00:00Z"}}]'::jsonb
  )
);
select is(
  (select jsonb_array_length(acknowledgement->'results')
   from revision_results where name = 'prayer-insert'),
  2,
  'the insert response attributes both prayer rows'
);
insert into revision_results values (
  'prayer-partial',
  public.upsert_mutable_account_rows(
    '91000000-0000-4000-8000-000000000001', 0, 'prayers',
    '[{"expected_revision":1,"row":{"id":"91100000-0000-4000-8000-000000000011","title":null,"body":"First past","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2026-07-21T20:00:00Z"}},{"expected_revision":0,"row":{"id":"91200000-0000-4000-8000-000000000012","title":null,"body":"Second future stale","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2026-07-23T20:00:00Z"}}]'::jsonb
  )
);
select is(
  (select acknowledgement->'results'->0->>'status'
   from revision_results where name = 'prayer-partial'),
  'applied',
  'the matching prayer revision applies despite a past clock'
);
select is(
  (select acknowledgement->'results'->1->>'status'
   from revision_results where name = 'prayer-partial'),
  'conflict',
  'the stale prayer revision conflicts despite a future clock'
);
select is(
  (select string_agg(body, ',' order by id) from public.prayers),
  'First past,Second',
  'partial application changes only the attributable prayer'
);

-- Cover the remaining resources with insert and revision-authorized updates.
insert into revision_results values
  (
    'reflection',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'reflections',
      '[{"expected_revision":0,"row":{"id":"91300000-0000-4000-8000-000000000013","prompt":null,"body":"Reflection","mood":null,"related_quest_slug":null,"related_verse_reference":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2026-07-22T20:00:00Z"}}]'::jsonb
    )
  ),
  (
    'quest',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'user_quests',
      '[{"expected_revision":0,"row":{"quest_slug":"walk-faith","status":"active","steps_done":[],"times_completed":0,"added_at":"2026-07-22T20:00:00Z","started_at":null,"paused_at":null,"completed_at":null,"archived_at":null,"last_activity_at":"2026-07-22T20:00:00Z"}}]'::jsonb
    )
  ),
  (
    'reading',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'reading_progress',
      '[{"expected_revision":0,"row":{"book_slug":"john","book_name":"John","chapter":3,"updated_at":"2026-07-22T20:00:00Z"}}]'::jsonb
    )
  ),
  (
    'bookmark',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'verse_bookmarks',
      '[{"expected_revision":0,"row":{"id":"91400000-0000-4000-8000-000000000014","book_slug":"john","book_name":"John","chapter":3,"verse":16,"text":"For God so loved","translation_key":"web","note":"Initial","created_at":"2026-07-22T20:00:00Z"}}]'::jsonb
    )
  ),
  (
    'recent',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'user_recent_verses',
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'expected_revision', 0,
        'row', pg_catalog.jsonb_build_object(
          'book_slug', 'psalms',
          'book_name', 'Psalms',
          'chapter', 23,
          'verse_start', 1,
          'verse_end', 2,
          'reference', 'Psalm 23:1-2',
          'text', 'The Lord',
          'viewed_at', pg_catalog.clock_timestamp() + interval '1 year'
        )
      ))
    )
  );
select is(
  (select count(*) from revision_results
   where name in ('reflection', 'quest', 'reading', 'bookmark', 'recent')
     and acknowledgement->'results'->0->>'status' = 'applied'),
  5::bigint,
  'all five remaining resource inserts apply through revision zero'
);
select is(
  (select count(*) from (
    select sync_revision from public.reflections
    union all select sync_revision from public.user_quests
    union all select sync_revision from public.reading_progress
    union all select sync_revision from public.verse_bookmarks
    union all select sync_revision from public.user_recent_verses
  ) as revisions where sync_revision = 1),
  5::bigint,
  'all inserted resources start at server revision one'
);
select ok(
  (select server_seen_at < viewed_at from public.user_recent_verses),
  'server order ignores a plus-one-year recent-verse clock'
);

-- Preserve the insert order so the update can prove a fresh server stamp.
create temporary table recent_server_order (
  inserted_at timestamptz not null
) on commit drop;
insert into recent_server_order
select server_seen_at from public.user_recent_verses;

insert into revision_results values
  (
    'quest-past',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'user_quests',
      '[{"expected_revision":1,"row":{"quest_slug":"walk-faith","status":"archived","steps_done":[],"times_completed":0,"added_at":"2026-07-22T20:00:00Z","started_at":null,"paused_at":null,"completed_at":null,"archived_at":null,"last_activity_at":"2026-07-21T20:00:00Z"}}]'::jsonb
    )
  ),
  (
    'reading-past',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'reading_progress',
      '[{"expected_revision":1,"row":{"book_slug":"genesis","book_name":"Genesis","chapter":1,"updated_at":"2026-07-21T20:00:00Z"}}]'::jsonb
    )
  ),
  (
    'bookmark-update',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'verse_bookmarks',
      '[{"expected_revision":1,"row":{"id":"91400000-0000-4000-8000-000000000014","book_slug":"john","book_name":"John","chapter":3,"verse":16,"text":"For God so loved","translation_key":"web","note":"Updated","created_at":"2027-07-22T20:00:00Z"}}]'::jsonb
    )
  ),
  (
    'recent-past',
    public.upsert_mutable_account_rows(
      '91000000-0000-4000-8000-000000000001', 0, 'user_recent_verses',
      '[{"expected_revision":1,"row":{"book_slug":"psalms","book_name":"Psalms","chapter":23,"verse_start":1,"verse_end":2,"reference":"Psalm 23:1-2","text":"The Lord is my shepherd","viewed_at":"2026-07-21T20:00:00Z"}}]'::jsonb
    )
  );
select is(
  (select count(*) from revision_results
   where name in ('quest-past', 'reading-past', 'bookmark-update', 'recent-past')
     and acknowledgement->'results'->0->>'status' = 'applied'
     and acknowledgement->'results'->0->>'revision' = '2'),
  4::bigint,
  'matching revisions apply independently of older or equal clocks'
);
select is(
  (select status from public.user_quests where quest_slug = 'walk-faith'),
  'archived',
  'the current shelf revision wins over its timestamp'
);
select is(
  (select book_slug from public.reading_progress),
  'genesis',
  'the current reading revision wins over its timestamp'
);
select is(
  (select note from public.verse_bookmarks),
  'Updated',
  'bookmark content advances through revision CAS'
);
select is(
  (select text from public.user_recent_verses),
  'The Lord is my shepherd',
  'recent-verse content advances through revision CAS'
);
select ok(
  (select verse.server_seen_at > ordering.inserted_at
   from public.user_recent_verses as verse
   cross join recent_server_order as ordering),
  'a recent-verse update advances server order despite an older viewed clock'
);

insert into revision_results values (
  'recent-stale-future',
  public.upsert_mutable_account_rows(
    '91000000-0000-4000-8000-000000000001', 0, 'user_recent_verses',
    '[{"expected_revision":1,"row":{"book_slug":"psalms","book_name":"Psalms","chapter":23,"verse_start":1,"verse_end":2,"reference":"Psalm 23:1-2","text":"Future stale","viewed_at":"2026-07-23T20:00:00Z"}}]'::jsonb
  )
);
select is(
  (select acknowledgement->'results'->0->>'status'
   from revision_results where name = 'recent-stale-future'),
  'conflict',
  'a future recent-verse clock cannot bypass a stale revision'
);
select is(
  (select text from public.user_recent_verses),
  'The Lord is my shepherd',
  'the stale future recent verse leaves canonical content unchanged'
);

-- Equal timestamps are ordered only by the server revision.
insert into revision_results values (
  'reflection-equal',
  public.upsert_mutable_account_rows(
    '91000000-0000-4000-8000-000000000001', 0, 'reflections',
    '[{"expected_revision":1,"row":{"id":"91300000-0000-4000-8000-000000000013","prompt":null,"body":"Equal timestamp update","mood":null,"related_quest_slug":null,"related_verse_reference":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2026-07-22T20:00:00Z"}}]'::jsonb
  )
);
select is(
  (select acknowledgement->'results'->0->>'revision'
   from revision_results where name = 'reflection-equal'),
  '2',
  'an equal timestamp advances only through its matching revision'
);
select is(
  (select body from public.reflections),
  'Equal timestamp update',
  'the revision-authorized equal timestamp persists'
);

-- Cross-owner primary-key collisions remain content-free conflicts.
select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000002',
  true
);
insert into revision_results values (
  'cross-owner',
  public.upsert_mutable_account_rows(
    '92000000-0000-4000-8000-000000000002', 0, 'prayers',
    '[{"expected_revision":0,"row":{"id":"91100000-0000-4000-8000-000000000011","title":null,"body":"Cross owner","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2026-07-22T20:00:00Z"}}]'::jsonb
  )
);
select is(
  (select acknowledgement from revision_results where name = 'cross-owner'),
  '{"generation":0,"results":[{"key":{"id":"91100000-0000-4000-8000-000000000011"},"status":"conflict","revision":0}]}'::jsonb,
  'cross-owner collisions expose no owner revision'
);
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select body from public.prayers
   where id = '91100000-0000-4000-8000-000000000011'),
  'First past',
  'the cross-owner collision changes no content'
);

-- Destructive generation semantics remain unchanged after v4 writes.
select is(
  public.delete_user_sync_rows(
    '91000000-0000-4000-8000-000000000001', 0,
    '91500000-0000-4000-8000-000000000015',
    '[{"resource":"prayers","id":"91100000-0000-4000-8000-000000000011"}]'::jsonb
  ),
  '{"deleted":1,"generation":1,"duplicate":false}'::jsonb,
  'generation-bumping delete continues to win without a row revision'
);
select is(
  public.delete_user_sync_rows(
    '91000000-0000-4000-8000-000000000001', 0,
    '91500000-0000-4000-8000-000000000015',
    '[{"resource":"prayers","id":"91100000-0000-4000-8000-000000000011"}]'::jsonb
  ),
  '{"deleted":0,"generation":1,"duplicate":true}'::jsonb,
  'the exact destructive retry remains idempotent'
);

reset role;
set role postgres;
select * from finish();
rollback;
