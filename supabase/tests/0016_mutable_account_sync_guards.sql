begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

-- Create two disposable identities for ownership and collision checks.
insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  ('61000000-0000-4000-8000-000000000001', '{}'::jsonb, now(), now()),
  ('62000000-0000-4000-8000-000000000002', '{}'::jsonb, now(), now());

-- Exercise historical timestamp guards through a transaction-local adapter;
-- 0018 separately proves this retired signature is absent in production.
create function public.upsert_mutable_account_rows(
  p_resource text,
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
  response := public.upsert_mutable_account_rows(
    uid,
    live_generation,
    p_resource,
    p_rows
  );
  return response - 'generation';
end;
$function$;

revoke execute on function public.upsert_mutable_account_rows(text, jsonb)
  from public, anon;
grant execute on function public.upsert_mutable_account_rows(text, jsonb)
  to authenticated;

-- Pin the callable surface and least-privilege grants.
select has_function(
  'public',
  'upsert_mutable_account_rows',
  array['text', 'jsonb'],
  'mutable account write RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.upsert_mutable_account_rows(text,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients may execute the guarded RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.upsert_mutable_account_rows(text,jsonb)',
    'EXECUTE'
  ),
  'anonymous clients cannot execute the guarded RPC'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_catalog.pg_proc
   where oid =
     'public.upsert_mutable_account_rows(text,jsonb)'::regprocedure),
  'mutable account RPC is security definer with an empty search path'
);

-- Exercise the grant boundary rather than relying on catalog inspection alone.
set local role anon;
select throws_ok(
  $$select public.upsert_mutable_account_rows('prayers', '[]'::jsonb)$$,
  '42501',
  null,
  'anonymous RPC execution is denied'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '61000000-0000-4000-8000-000000000001',
  true
);

-- Store acknowledgements so assertions never repeat a private-data mutation.
create temporary table mutable_write_results (
  name text primary key,
  acknowledgement jsonb not null
) on commit drop;

-- Every supported resource derives its owner from the authenticated identity.
insert into mutable_write_results values
  (
    'profile',
    public.upsert_mutable_account_rows(
      'profiles',
      '[{"display_name":"Synthetic owner","tradition":null,"primary_goal":null,"calling":null,"daily_rhythm":null,"quest_style":null,"onboarding_completed":true,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:00Z"}]'::jsonb
    )
  ),
  (
    'settings',
    public.upsert_mutable_account_rows(
      'user_settings',
      '[{"theme":"dark","reduced_motion":false,"text_size":"default","quest_duration_pref":[5,10],"quest_category_pref":["prayer"],"language":"en","preferred_bible_translation":"kjv","analytics_consent":false,"updated_at":"2027-07-22T20:00:00Z"}]'::jsonb
    )
  ),
  (
    'notifications',
    public.upsert_mutable_account_rows(
      'notification_preferences',
      '[{"daily_verse_enabled":true,"daily_quest_enabled":false,"prayer_reminders_enabled":false,"weekly_recap_enabled":true,"preferred_time":"08:00","updated_at":"2027-07-22T20:00:00Z"}]'::jsonb
    )
  ),
  (
    'prayer',
    public.upsert_mutable_account_rows(
      'prayers',
      '[{"id":"63000000-0000-4000-8000-000000000003","title":null,"body":"Synthetic current prayer","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:00Z"}]'::jsonb
    )
  ),
  (
    'reflection',
    public.upsert_mutable_account_rows(
      'reflections',
      '[{"id":"64000000-0000-4000-8000-000000000004","prompt":null,"body":"Synthetic current reflection","mood":null,"related_quest_slug":null,"related_verse_reference":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:00Z"}]'::jsonb
    )
  );

select is(
  (select count(*)
   from mutable_write_results
   where acknowledgement = '{"applied":1,"stale":0}'::jsonb),
  5::bigint,
  'all five mutable resources accept an owner write'
);
select is(
  (select count(*)
   from (
     select id from public.profiles
       where id = '61000000-0000-4000-8000-000000000001'
     union all
     select user_id from public.user_settings
       where user_id = '61000000-0000-4000-8000-000000000001'
     union all
     select user_id from public.notification_preferences
       where user_id = '61000000-0000-4000-8000-000000000001'
     union all
     select user_id from public.prayers
       where user_id = '61000000-0000-4000-8000-000000000001'
     union all
     select user_id from public.reflections
       where user_id = '61000000-0000-4000-8000-000000000001'
   ) as owned_rows),
  5::bigint,
  'all supported resources are owned by auth.uid'
);

-- Caller-supplied ownership is rejected rather than trusted.
select throws_ok(
  $$select public.upsert_mutable_account_rows(
      'prayers',
      '[{"id":"65000000-0000-4000-8000-000000000005","user_id":"62000000-0000-4000-8000-000000000002","body":"Synthetic spoof","category":"general","status":"active","created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:00Z"}]'::jsonb
    )$$,
  '22023',
  'upsert_mutable_account_rows: invalid prayer rows',
  'caller-supplied owner ids fail closed'
);

-- The acknowledgement has two bounded counts and no row content or identity.
select is(
  (select count(*)
   from mutable_write_results as result,
        lateral jsonb_object_keys(result.acknowledgement)),
  10::bigint,
  'each acknowledgement contains exactly two fields'
);
select ok(
  not exists (
    select 1
    from mutable_write_results
    where acknowledgement::text ~ '(body|display_name|id|user_id)'
  ),
  'acknowledgements expose no content or identifiers'
);
select ok(
  (select bool_and(
     (acknowledgement->>'applied')::integer between 0 and 200
     and (acknowledgement->>'stale')::integer between 0 and 200
   ) from mutable_write_results),
  'acknowledgement counts stay within the request bound'
);

-- A stale prayer update is acknowledged but cannot replace newer content.
insert into mutable_write_results values (
  'stale',
  public.upsert_mutable_account_rows(
    'prayers',
    '[{"id":"63000000-0000-4000-8000-000000000003","title":null,"body":"Synthetic stale prayer","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T19:59:59Z"}]'::jsonb
  )
);
select is(
  (select acknowledgement from mutable_write_results where name = 'stale'),
  '{"applied":0,"stale":1}'::jsonb,
  'stale updates are reported without returning the row'
);
select is(
  (select body from public.prayers
   where id = '63000000-0000-4000-8000-000000000003'),
  'Synthetic current prayer',
  'stale content cannot replace the current prayer'
);

-- Replaying the same timestamp and values is safe and leaves one canonical row.
insert into mutable_write_results values (
  'equal-retry',
  public.upsert_mutable_account_rows(
    'prayers',
    '[{"id":"63000000-0000-4000-8000-000000000003","title":null,"body":"Synthetic current prayer","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2027-07-22T20:00:00Z"}]'::jsonb
  )
);
select is(
  (select acknowledgement
   from mutable_write_results where name = 'equal-retry'),
  '{"applied":1,"stale":0}'::jsonb,
  'equal-timestamp retry is idempotently accepted'
);
select is(
  (select count(*) from public.prayers
   where id = '63000000-0000-4000-8000-000000000003'),
  1::bigint,
  'equal-timestamp retry creates no duplicate row'
);

-- A second identity cannot update a row owned by the first identity.
select set_config(
  'request.jwt.claim.sub',
  '62000000-0000-4000-8000-000000000002',
  true
);
insert into mutable_write_results values (
  'other-owner',
  public.upsert_mutable_account_rows(
    'prayers',
    '[{"id":"63000000-0000-4000-8000-000000000003","title":null,"body":"Synthetic cross-owner prayer","category":"general","status":"active","answered_at":null,"answer_reflection":null,"archived_at":null,"created_at":"2026-07-22T20:00:00Z","updated_at":"2028-07-22T20:00:00Z"}]'::jsonb
  )
);
select is(
  (select acknowledgement
   from mutable_write_results where name = 'other-owner'),
  '{"applied":0,"stale":1}'::jsonb,
  'cross-owner collision applies no write'
);
select set_config(
  'request.jwt.claim.sub',
  '61000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select user_id from public.prayers
   where id = '63000000-0000-4000-8000-000000000003'),
  '61000000-0000-4000-8000-000000000001'::uuid,
  'cross-owner collision cannot change ownership'
);
select is(
  (select body from public.prayers
   where id = '63000000-0000-4000-8000-000000000003'),
  'Synthetic current prayer',
  'cross-owner collision cannot change content'
);

-- Invalid resources are rejected before any dynamic table access.
select throws_ok(
  $$select public.upsert_mutable_account_rows('subscriptions', '[]'::jsonb)$$,
  '22023',
  'upsert_mutable_account_rows: invalid resource',
  'the RPC allowlist excludes subscription data'
);

reset role;
select * from finish();
rollback;
