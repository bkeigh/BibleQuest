begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select is(
  public.guided_progress_sync_contract(),
  '{"ok": true, "contract": "biblequest_guided_progress_sync_v1"}'::jsonb,
  'the bounded guided-progress sync contract is ready'
);
select ok(
  has_table_privilege(
    'authenticated', 'public.user_guided_movements', 'SELECT'
  ),
  'authenticated users may select owner-scoped movement markers'
);
select ok(
  has_table_privilege(
    'authenticated', 'public.user_guided_movements', 'INSERT'
  ),
  'authenticated users may append owner-scoped movement markers'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.user_guided_movements', 'UPDATE'
  ),
  'movement markers cannot be rewritten'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.user_guided_movements', 'DELETE'
  ),
  'movement markers cannot be deleted outside the generation-bound purge'
);

insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('c1000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('c2000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

set local role service_role;
insert into public.user_guided_movements (
  user_id, session_key, content_id, movement_key, occurred_at
) values
  (
    'c1000000-0000-4000-8000-000000000001',
    'pilgrimage|pilgrimage.learning-to-remain.day-01.v1',
    'pilgrimage.learning-to-remain.day-01.v1',
    'started',
    '2026-07-29T12:00:00.000Z'
  ),
  (
    'c2000000-0000-4000-8000-000000000002',
    'pilgrimage|pilgrimage.learning-to-remain.day-01.v1',
    'pilgrimage.learning-to-remain.day-01.v1',
    'started',
    '2026-07-29T12:00:00.000Z'
  );
reset role;
set role postgres;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);
select is(
  (
    select pg_catalog.count(*)
    from public.user_guided_movements
  ),
  1::bigint,
  'owner A cannot read owner B progress'
);
select throws_ok(
  $sql$
    insert into public.user_guided_movements (
      user_id, session_key, content_id, movement_key, occurred_at
    ) values (
      'c2000000-0000-4000-8000-000000000002',
      'pilgrimage|pilgrimage.learning-to-remain.day-01.v1',
      'pilgrimage.learning-to-remain.day-01.v1',
      'read',
      '2026-07-29T12:01:00.000Z'
    )
  $sql$,
  '42501',
  null,
  'owner A cannot append progress for owner B'
);
reset role;
set role postgres;

update public.user_sync_state
set generation = 2
where user_id = 'c1000000-0000-4000-8000-000000000001';

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-expected-user":"c1000000-0000-4000-8000-000000000001","x-biblequest-sync-generation":"2"}',
  true
);
select lives_ok(
  $sql$
    insert into public.user_guided_movements (
      user_id, session_key, content_id, movement_key, occurred_at
    ) values (
      'c1000000-0000-4000-8000-000000000001',
      'pilgrimage|pilgrimage.learning-to-remain.day-01.v1',
      'pilgrimage.learning-to-remain.day-01.v1',
      'arrive',
      '2026-07-29T12:02:00.000Z'
    )
  $sql$,
  'the current generation may append an owner marker'
);
select is(
  (
    select pg_catalog.count(*)
    from public.user_guided_movements
  ),
  2::bigint,
  'the owner sees both current markers and no other account rows'
);

select pg_catalog.set_config(
  'request.headers',
  '{"x-biblequest-expected-user":"c1000000-0000-4000-8000-000000000001","x-biblequest-sync-generation":"1"}',
  true
);
select throws_ok(
  $sql$
    insert into public.user_guided_movements (
      user_id, session_key, content_id, movement_key, occurred_at
    ) values (
      'c1000000-0000-4000-8000-000000000001',
      'pilgrimage|pilgrimage.learning-to-remain.day-01.v1',
      'pilgrimage.learning-to-remain.day-01.v1',
      'read',
      '2026-07-29T12:03:00.000Z'
    )
  $sql$,
  '40001',
  null,
  'a stale account generation fails closed'
);

select is(
  (
    public.purge_user_data(
      'c1000000-0000-4000-8000-000000000001',
      2,
      'c1000000-0000-4000-8000-000000000099'
    )->>'generation'
  )::bigint,
  3::bigint,
  'the generation-bound purge advances after clearing the owner journey'
);
reset role;
set role postgres;

select is(
  (
    select pg_catalog.count(*)
    from public.user_guided_movements
    where user_id = 'c1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'purge removes owner A guided progress'
);
select is(
  (
    select pg_catalog.count(*)
    from public.user_guided_movements
    where user_id = 'c2000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'purge preserves owner B guided progress'
);
select is(
  (
    select pg_catalog.count(*)
    from public.user_guided_movements
    where movement_key = 'read'
  ),
  0::bigint,
  'the stale marker never lands'
);

select * from finish();
rollback;
