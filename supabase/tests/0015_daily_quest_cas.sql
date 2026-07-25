-- Exercise the migration 0015 CAS, RLS, idempotency, and rollback contract.
begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

-- Create two disposable owners; the surrounding transaction removes them.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

-- Inject a post-delete insertion failure to prove statement rollback.
create function public.test_fail_daily_quest_insert()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.quest_slug = '__cas_fail__' then
    raise exception 'injected write failure';
  end if;
  return new;
end;
$function$;

create trigger test_fail_daily_quest_insert
before insert on public.user_daily_quests
for each row execute function public.test_fail_daily_quest_insert();

-- Verify the exposed schema, owner-only policy, and least-privilege grants.
select has_table('public', 'user_daily_quest_days', 'revision table exists');
select ok(
  (select relrowsecurity
   from pg_catalog.pg_class
   where oid = 'public.user_daily_quest_days'::regclass),
  'revision table has RLS enabled'
);
select is(
  (select count(*)
   from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename = 'user_daily_quest_days'
     and cmd = 'SELECT'
     and roles = array['authenticated']::name[]),
  1::bigint,
  'revision table has one authenticated SELECT policy'
);
select ok(
  has_column_privilege(
    'authenticated',
    'public.user_daily_quest_days',
    'assigned_date',
    'SELECT'
  ),
  'authenticated may read assigned_date'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.user_daily_quest_days',
    'user_id',
    'SELECT'
  ),
  'authenticated cannot select raw owner ids'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.user_daily_quest_days',
    'INSERT'
  ),
  'authenticated cannot write revisions directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.replace_user_daily_quests(date,bigint,uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated may execute the CAS RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.replace_user_daily_quests(date,bigint,uuid,jsonb)',
    'EXECUTE'
  ),
  'anonymous clients cannot execute the CAS RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.bump_daily_quest_revision_for_legacy_write()',
    'EXECUTE'
  ),
  'legacy revision trigger cannot be called as an RPC'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_catalog.pg_proc
   where oid =
     'public.replace_user_daily_quests(date,bigint,uuid,jsonb)'::regprocedure),
  'CAS RPC is security definer with an empty search path'
);

-- Act as the first owner for all same-account CAS scenarios.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

-- Apply an initial request and prove the response omits owner identifiers.
select is(
  public.replace_user_daily_quests(
    '2026-07-20',
    0,
    'a0000000-0000-4000-8000-000000000001',
    '[{"quest_slug":"cas-a","status":"assigned","rerolls":0,"picked_at":"2026-07-20T12:00:00Z","expires_at":"2026-07-21T12:00:00Z"}]'::jsonb
  )->>'status',
  'applied',
  'initial request applies'
);
select is(
  (select revision
   from public.user_daily_quest_days
   where assigned_date = '2026-07-20'),
  1::bigint,
  'initial request advances revision once'
);
select ok(
  not (
    public.replace_user_daily_quests(
      '2026-07-20',
      0,
      'a0000000-0000-4000-8000-000000000001',
      '[{"quest_slug":"cas-a","status":"assigned","rerolls":0,"picked_at":"2026-07-20T12:00:00Z","expires_at":"2026-07-21T12:00:00Z"}]'::jsonb
    )::text like '%user_id%'
  ),
  'RPC response contains no owner id field'
);

-- Replay the same request after a lost response without a second mutation.
select is(
  public.replace_user_daily_quests(
    '2026-07-20',
    0,
    'a0000000-0000-4000-8000-000000000001',
    '[{"quest_slug":"cas-a","status":"assigned","rerolls":0,"picked_at":"2026-07-20T12:00:00Z","expires_at":"2026-07-21T12:00:00Z"}]'::jsonb
  )->>'duplicate',
  'true',
  'duplicate request is acknowledged'
);
select is(
  (select revision
   from public.user_daily_quest_days
   where assigned_date = '2026-07-20'),
  1::bigint,
  'duplicate request does not advance revision'
);

-- Reject a simultaneous stale device without changing canonical rows.
select is(
  public.replace_user_daily_quests(
    '2026-07-20',
    0,
    'b0000000-0000-4000-8000-000000000001',
    '[{"quest_slug":"cas-b","status":"assigned","rerolls":0,"picked_at":"2026-07-20T12:00:00Z","expires_at":"2026-07-21T12:00:00Z"}]'::jsonb
  )->>'status',
  'conflict',
  'stale revision returns a bounded conflict'
);
select is(
  (select string_agg(quest_slug, ',' order by quest_slug)
   from public.user_daily_quests
   where assigned_date = '2026-07-20'),
  'cas-a',
  'stale revision leaves canonical rows unchanged'
);

-- Retry the client-merged day against the observed revision.
select is(
  public.replace_user_daily_quests(
    '2026-07-20',
    1,
    'b0000000-0000-4000-8000-000000000002',
    '[{"quest_slug":"cas-a","status":"assigned","rerolls":0,"picked_at":"2026-07-20T12:00:00Z","expires_at":"2026-07-21T12:00:00Z"},{"quest_slug":"cas-b","status":"assigned","rerolls":0,"picked_at":"2026-07-20T12:00:00Z","expires_at":"2026-07-21T12:00:00Z"}]'::jsonb
  )->>'status',
  'applied',
  'merged conflict retry applies'
);
select is(
  (select count(*)
   from public.user_daily_quests
   where assigned_date = '2026-07-20'),
  2::bigint,
  'merged conflict retry retains both device picks'
);

-- Force a failure after deletion and prove rows plus revision roll back.
select public.replace_user_daily_quests(
  '2026-07-21',
  0,
  'c0000000-0000-4000-8000-000000000001',
  '[{"quest_slug":"rollback-kept","status":"assigned","rerolls":0,"picked_at":"2026-07-21T12:00:00Z","expires_at":"2026-07-22T12:00:00Z"}]'::jsonb
);
select throws_ok(
  $$select public.replace_user_daily_quests(
    '2026-07-21',
    1,
    'c0000000-0000-4000-8000-000000000002',
    '[{"quest_slug":"__cas_fail__","status":"assigned","rerolls":0,"picked_at":"2026-07-21T12:00:00Z","expires_at":"2026-07-22T12:00:00Z"}]'::jsonb
  )$$,
  'P0001',
  'injected write failure',
  'post-delete failure aborts the whole replacement'
);
select is(
  (select string_agg(quest_slug, ',' order by quest_slug)
   from public.user_daily_quests
   where assigned_date = '2026-07-21'),
  'rollback-kept',
  'rollback restores the deleted assignment'
);
select is(
  (select revision
   from public.user_daily_quest_days
   where assigned_date = '2026-07-21'),
  1::bigint,
  'rollback does not advance revision'
);

-- An empty replacement removes an unfinished pick and advances once.
select public.replace_user_daily_quests(
  '2026-07-22',
  0,
  'd0000000-0000-4000-8000-000000000001',
  '[{"quest_slug":"unpicked","status":"assigned","rerolls":0,"picked_at":"2026-07-22T12:00:00Z","expires_at":"2026-07-23T12:00:00Z"}]'::jsonb
);
select public.replace_user_daily_quests(
  '2026-07-22',
  1,
  'd0000000-0000-4000-8000-000000000002',
  '[]'::jsonb
);
select is(
  (select count(*)
   from public.user_daily_quests
   where assigned_date = '2026-07-22'),
  0::bigint,
  'empty replacement persists an unpick'
);
select is(
  (select revision
   from public.user_daily_quest_days
   where assigned_date = '2026-07-22'),
  2::bigint,
  'unpick advances revision once'
);

-- Completed rows cannot be deleted or downgraded by a replacement.
select public.replace_user_daily_quests(
  '2026-07-23',
  0,
  'e0000000-0000-4000-8000-000000000001',
  '[{"quest_slug":"completed","status":"completed","rerolls":0,"completed_at":"2026-07-23T12:10:00Z","picked_at":"2026-07-23T12:00:00Z","expires_at":"2026-07-24T12:00:00Z"}]'::jsonb
);
select public.replace_user_daily_quests(
  '2026-07-23',
  1,
  'e0000000-0000-4000-8000-000000000002',
  '[]'::jsonb
);
select is(
  (select count(*)
   from public.user_daily_quests
   where assigned_date = '2026-07-23'),
  1::bigint,
  'empty replacement preserves completed history'
);
select is(
  (select status
   from public.user_daily_quests
   where assigned_date = '2026-07-23'),
  'completed',
  'completed status is preserved'
);
select is(
  (select revision
   from public.user_daily_quest_days
   where assigned_date = '2026-07-23'),
  2::bigint,
  'completed-preserving replacement still acknowledges the request'
);

-- Old cached clients retain direct owner writes and make them CAS-visible.
select set_config('biblequest.daily_quest_rpc', 'off', true);
insert into public.user_daily_quests (
  user_id,
  quest_slug,
  assigned_date,
  status,
  rerolls,
  picked_at,
  expires_at
) values (
  '10000000-0000-4000-8000-000000000001',
  'legacy',
  '2026-07-24',
  'assigned',
  0,
  '2026-07-24T12:00:00Z',
  '2026-07-25T12:00:00Z'
);
select is(
  (select revision
   from public.user_daily_quest_days
   where assigned_date = '2026-07-24'),
  1::bigint,
  'legacy insert advances the opaque revision'
);
delete from public.user_daily_quests
where assigned_date = '2026-07-24';
select is(
  (select revision
   from public.user_daily_quest_days
   where assigned_date = '2026-07-24'),
  2::bigint,
  'legacy delete advances the opaque revision'
);

-- Switch owners and prove both RLS and RPC ownership derive from auth.uid().
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from public.user_daily_quest_days),
  0::bigint,
  'second owner cannot select first owner revisions'
);
select is(
  public.replace_user_daily_quests(
    '2026-07-25',
    0,
    'f0000000-0000-4000-8000-000000000001',
    '[{"quest_slug":"owner-b","status":"assigned","rerolls":0,"picked_at":"2026-07-25T12:00:00Z","expires_at":"2026-07-26T12:00:00Z"}]'::jsonb
  )->>'status',
  'applied',
  'RPC writes only the authenticated owner'
);
select throws_ok(
  $$insert into public.user_daily_quests (
    user_id, quest_slug, assigned_date, status, rerolls, picked_at, expires_at
  ) values (
    '10000000-0000-4000-8000-000000000001',
    'cross-owner',
    '2026-07-25',
    'assigned',
    0,
    '2026-07-25T12:00:00Z',
    '2026-07-26T12:00:00Z'
  )$$,
  '42501',
  'new row violates row-level security policy for table "user_daily_quests"',
  'direct cross-owner insert is denied'
);

-- Clear My Data removes the first owner's empty-day metadata but not owner B.
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select public.purge_user_data();
reset role;
select is(
  (select count(*)
   from public.user_daily_quest_days
   where user_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint,
  'purge removes the authenticated owner revisions'
);
select is(
  (select count(*)
   from public.user_daily_quest_days
   where user_id = '20000000-0000-4000-8000-000000000002'),
  1::bigint,
  'purge preserves another owner revisions'
);

select * from finish();
rollback;
