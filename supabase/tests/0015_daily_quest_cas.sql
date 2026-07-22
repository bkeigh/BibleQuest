begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(59);

-- Create two disposable owners; the surrounding transaction removes them.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

-- Exercise historical CAS assertions through a transaction-local adapter;
-- 0018 separately proves this retired signature is absent in production.
create function public.replace_user_daily_quests(
  p_assigned_date date,
  p_expected_revision bigint,
  p_request_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  live_generation bigint;
  response jsonb;
begin
  select generation into live_generation
  from public.user_sync_state
  where user_id = uid;
  response := public.replace_user_daily_quests(
    uid,
    live_generation,
    p_assigned_date,
    p_expected_revision,
    p_request_id,
    p_rows
  );
  return response - 'generation';
end;
$function$;

revoke execute on function public.replace_user_daily_quests(
  date, bigint, uuid, jsonb
) from public, anon;
grant execute on function public.replace_user_daily_quests(
  date, bigint, uuid, jsonb
) to authenticated;

-- Adapt the historical void purge only inside this rollback-only test.
create function public.purge_user_data()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  live_generation bigint;
begin
  select generation into live_generation
  from public.user_sync_state
  where user_id = uid;
  perform public.purge_user_data(
    uid,
    live_generation,
    extensions.gen_random_uuid()
  );
end;
$function$;

revoke execute on function public.purge_user_data() from public, anon;
grant execute on function public.purge_user_data() to authenticated;

-- Pin the authoritative 0014 Journey identity before exercising 0015.
select has_column(
  'public',
  'journey_events',
  'date_key',
  '0014 date_key column exists'
);
select has_column(
  'public',
  'journey_events',
  'source_id',
  '0014 source_id column exists'
);
select is(
  (select count(*)
   from pg_catalog.pg_trigger
   where tgrelid = 'public.journey_events'::regclass
     and tgname = 'ensure_journey_event_date_key'
     and not tgisinternal),
  1::bigint,
  '0014 legacy Journey trigger exists exactly once'
);
insert into public.journey_events (
  id,
  user_id,
  event_type,
  title,
  occurred_at
) values (
  '14000000-0000-4000-8000-000000000014',
  '10000000-0000-4000-8000-000000000001',
  'test',
  'migration identity fixture',
  '2026-07-19T23:30:00-04:00'
);
select is(
  (select date_key
   from public.journey_events
   where id = '14000000-0000-4000-8000-000000000014'),
  '2026-07-20'::date,
  '0014 cached-client fallback derives the deterministic UTC day'
);

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
  not has_function_privilege(
    'authenticated',
    'public.preserve_daily_quest_completion_for_legacy_write()',
    'EXECUTE'
  ),
  'legacy completion trigger cannot be called as an RPC'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_catalog.pg_proc
   where oid =
     'public.replace_user_daily_quests(date,bigint,uuid,jsonb)'::regprocedure),
  'CAS RPC is security definer with an empty search path'
);

-- The anonymous readiness RPC exposes only a live, content-free contract bit.
select ok(
  to_regprocedure('public.daily_quest_sync_contract()') is not null,
  'daily-quest readiness contract exists'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_catalog.pg_proc
   where oid = 'public.daily_quest_sync_contract()'::regprocedure),
  'readiness contract is security definer with an empty search path'
);
select ok(
  has_function_privilege(
    'anon', 'public.daily_quest_sync_contract()', 'EXECUTE'
  ),
  'anonymous readiness may execute the content-free contract'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.daily_quest_sync_contract()', 'EXECUTE'
  ),
  'authenticated readiness may execute the content-free contract'
);
set local role anon;
select is(
  public.daily_quest_sync_contract()->>'contract',
  'biblequest_daily_quest_sync_v1',
  'readiness contract returns the fixed CAS identity'
);
select is(
  public.daily_quest_sync_contract()->>'ok',
  'true',
  'readiness contract derives a passing live safety posture'
);
select is(
  (select count(*)
   from jsonb_object_keys(public.daily_quest_sync_contract())),
  2::bigint,
  'readiness contract returns no diagnostic or row fields'
);
reset role;

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

-- Replay an older request after an intervening device write.
select is(
  public.replace_user_daily_quests(
    '2026-07-20',
    0,
    'a0000000-0000-4000-8000-000000000001',
    '[{"quest_slug":"cas-a","status":"assigned","rerolls":0,"picked_at":"2026-07-20T12:00:00Z","expires_at":"2026-07-21T12:00:00Z"}]'::jsonb
  )->>'duplicate',
  'true',
  'bounded request history deduplicates across an intervening write'
);
select is(
  (select revision
   from public.user_daily_quest_days
   where assigned_date = '2026-07-20'),
  2::bigint,
  'interleaved duplicate does not advance revision'
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
delete from public.user_daily_quests
where assigned_date = '2026-07-23';
select is(
  (select count(*)
   from public.user_daily_quests
   where assigned_date = '2026-07-23'
     and status = 'completed'),
  1::bigint,
  'cached legacy delete cannot remove completed history'
);
insert into public.user_daily_quests (
  user_id,
  quest_slug,
  assigned_date,
  status,
  rerolls,
  completed_at,
  picked_at,
  expires_at
) values
  (
    '10000000-0000-4000-8000-000000000001',
    'completed',
    '2026-07-23',
    'completed',
    0,
    '2026-07-23T12:10:00Z',
    '2026-07-23T12:00:00Z',
    '2026-07-24T12:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    'legacy-peer',
    '2026-07-23',
    'assigned',
    0,
    null,
    '2026-07-23T12:00:00Z',
    '2026-07-24T12:00:00Z'
  );
select is(
  (select string_agg(quest_slug || ':' || status, ',' order by quest_slug)
   from public.user_daily_quests
   where assigned_date = '2026-07-23'),
  'completed:completed,legacy-peer:assigned',
  'cached legacy insert skips the duplicate completion and keeps new picks'
);
select is(
  (select revision
   from public.user_daily_quest_days
   where assigned_date = '2026-07-23'),
  3::bigint,
  'only the real legacy row change advances the revision'
);

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
  (select count(*)
   from public.user_daily_quests
   where assigned_date < '2026-07-25'),
  0::bigint,
  'second owner cannot select first owner assignments'
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
  'account sync: authenticated user changed',
  'direct cross-owner insert is denied'
);
select is_empty(
  $$update public.user_daily_quests
    set status = 'started'
    where user_id = '10000000-0000-4000-8000-000000000001'
    returning 1$$,
  'second owner cannot update first owner assignments'
);
select is_empty(
  $$delete from public.user_daily_quests
    where user_id = '10000000-0000-4000-8000-000000000001'
    returning 1$$,
  'second owner cannot delete first owner assignments'
);

-- Clear My Data removes the first owner's empty-day metadata but not owner B.
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*)
   from public.user_daily_quest_days
   where assigned_date = '2026-07-25'),
  0::bigint,
  'first owner cannot select second owner revisions'
);
select is(
  (select count(*)
   from public.user_daily_quests
   where assigned_date = '2026-07-25'),
  0::bigint,
  'first owner cannot select second owner assignments'
);
select throws_ok(
  $$insert into public.user_daily_quests (
    user_id, quest_slug, assigned_date, status, rerolls, picked_at, expires_at
  ) values (
    '20000000-0000-4000-8000-000000000002',
    'cross-owner-reverse',
    '2026-07-25',
    'assigned',
    0,
    '2026-07-25T12:00:00Z',
    '2026-07-26T12:00:00Z'
  )$$,
  '42501',
  'account sync: authenticated user changed',
  'first owner direct cross-owner insert is denied'
);
select is_empty(
  $$update public.user_daily_quests
    set status = 'started'
    where user_id = '20000000-0000-4000-8000-000000000002'
    returning 1$$,
  'first owner cannot update second owner assignments'
);
select is_empty(
  $$delete from public.user_daily_quests
    where user_id = '20000000-0000-4000-8000-000000000002'
    returning 1$$,
  'first owner cannot delete second owner assignments'
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
