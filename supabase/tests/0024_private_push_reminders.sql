begin;

-- Linked CLI tests enter through a restricted login; use the database owner.
set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(39);

select is(
  public.push_reminder_contract(),
  '{"contract":"biblequest_private_push_v1","ok":true}'::jsonb,
  'the private push contract is ready'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'push_reminder_preferences',
        'push_subscriptions',
        'push_deliveries',
        'push_test_claims'
      )
      and class.relrowsecurity
  ),
  4::bigint,
  'all four push tables enforce RLS'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and policyname in (
        'push preferences: read own',
        'push subscriptions: read own',
        'push deliveries: read own'
      )
  ),
  3::bigint,
  'only the three safe owner-read policies exist'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.push_subscriptions',
    'endpoint_fingerprint',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'public.push_subscriptions',
    'encrypted_subscription',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'public.push_subscriptions',
    'encryption_key_version',
    'SELECT'
  ),
  'authenticated clients cannot read endpoint or ciphertext fields'
);
select is(
  (
    select count(*)
    from (values
      ('push_reminder_preferences'),
      ('push_subscriptions'),
      ('push_deliveries'),
      ('push_test_claims')
    ) as resource(table_name)
    where has_table_privilege(
      'authenticated',
      'public.' || resource.table_name,
      'INSERT,UPDATE,DELETE'
    )
  ),
  0::bigint,
  'authenticated clients cannot directly mutate push state'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_push_delivery(uuid,uuid,text,date,timestamptz)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.complete_push_delivery(uuid,uuid,text,integer,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.claim_push_test(uuid)',
    'EXECUTE'
  ),
  'the service role owns atomic claim and completion entry points'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_push_delivery(uuid,uuid,text,date,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.claim_push_test(uuid)',
    'EXECUTE'
  ),
  'browser roles cannot claim deliveries or test sends'
);

insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    '{}'::jsonb,
    now(),
    now()
  );

set local role service_role;
insert into public.push_reminder_preferences (
  user_id,
  daily_verse_enabled,
  delivery_time,
  timezone
) values (
  'b1000000-0000-4000-8000-000000000001',
  true,
  '08:00',
  'America/New_York'
);
insert into public.push_subscriptions (
  id,
  user_id,
  endpoint_fingerprint,
  encrypted_subscription,
  encryption_key_version
) values (
  'b1100000-0000-4000-8000-000000000011',
  'b1000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  repeat('ciphertext', 12),
  1
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*) from public.push_reminder_preferences),
  1::bigint,
  'the owner can read their reminder preferences'
);
select is(
  (select count(*) from public.push_subscriptions),
  1::bigint,
  'the owner can read their sanitized subscription posture'
);
select throws_ok(
  $$select encrypted_subscription from public.push_subscriptions$$,
  '42501',
  null,
  'the owner cannot select encrypted endpoint material'
);
select throws_ok(
  $$update public.push_reminder_preferences
    set daily_verse_enabled = false$$,
  '42501',
  null,
  'the owner cannot bypass the validated reminder route'
);

select set_config(
  'request.jwt.claim.sub',
  'b2000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from public.push_reminder_preferences),
  0::bigint,
  'another account cannot read the owner preferences'
);
select is(
  (select count(*) from public.push_subscriptions),
  0::bigint,
  'another account cannot read the owner subscription posture'
);

set local role service_role;
create temporary table push_claim_results (
  name text primary key,
  response jsonb not null
) on commit drop;
insert into push_claim_results values (
  'daily-first',
  public.claim_push_delivery(
    'b1100000-0000-4000-8000-000000000011',
    'b1000000-0000-4000-8000-000000000001',
    'daily_verse',
    current_date,
    now()
  )
);
select is(
  (select response->>'claimed' from push_claim_results where name = 'daily-first'),
  'true',
  'the first scheduled delivery wins its idempotency claim'
);
select is(
  public.claim_push_delivery(
    'b1100000-0000-4000-8000-000000000011',
    'b1000000-0000-4000-8000-000000000001',
    'daily_verse',
    current_date,
    now()
  )->>'claimed',
  'false',
  'a duplicate scheduled delivery is rejected'
);
select is(
  public.complete_push_delivery(
    (
      select (response->>'delivery_id')::uuid
      from push_claim_results where name = 'daily-first'
    ),
    (
      select (response->>'claim_token')::uuid
      from push_claim_results where name = 'daily-first'
    ),
    'sent',
    2,
    'ok',
    300
  ),
  true,
  'the active claim completes successfully'
);
select is(
  (
    select status
    from public.push_deliveries
    where reminder_kind = 'daily_verse'
  ),
  'sent',
  'the sent metric stores only a bounded outcome'
);
select is(
  (
    select transient_failures
    from public.push_subscriptions
    where id = 'b1100000-0000-4000-8000-000000000011'
  ),
  0,
  'successful completion resets subscription failures atomically'
);
select is(
  public.complete_push_delivery(
    (
      select (response->>'delivery_id')::uuid
      from push_claim_results where name = 'daily-first'
    ),
    (
      select (response->>'claim_token')::uuid
      from push_claim_results where name = 'daily-first'
    ),
    'sent',
    2,
    'ok',
    300
  ),
  false,
  'a finished token cannot complete twice'
);

insert into push_claim_results values (
  'retry-one',
  public.claim_push_delivery(
    'b1100000-0000-4000-8000-000000000011',
    'b1000000-0000-4000-8000-000000000001',
    'daily_quest',
    current_date,
    now()
  )
);
select is(
  (select response->>'attempt' from push_claim_results where name = 'retry-one'),
  '1',
  'a retryable delivery begins at attempt one'
);
select is(
  public.complete_push_delivery(
    (
      select (response->>'delivery_id')::uuid
      from push_claim_results where name = 'retry-one'
    ),
    (
      select (response->>'claim_token')::uuid
      from push_claim_results where name = 'retry-one'
    ),
    'transient_failure',
    5,
    'provider',
    60
  ),
  true,
  'attempt one records one bounded transient failure'
);
select is(
  public.claim_push_delivery(
    'b1100000-0000-4000-8000-000000000011',
    'b1000000-0000-4000-8000-000000000001',
    'daily_quest',
    current_date,
    now()
  )->>'claimed',
  'false',
  'a retry cannot run before its backoff'
);

update public.push_deliveries
set next_attempt_at = now() - interval '1 second'
where reminder_kind = 'daily_quest';
insert into push_claim_results values (
  'retry-two',
  public.claim_push_delivery(
    'b1100000-0000-4000-8000-000000000011',
    'b1000000-0000-4000-8000-000000000001',
    'daily_quest',
    current_date,
    now()
  )
);
select is(
  (select response->>'attempt' from push_claim_results where name = 'retry-two'),
  '2',
  'the first bounded retry advances to attempt two'
);
select is(
  public.complete_push_delivery(
    (
      select (response->>'delivery_id')::uuid
      from push_claim_results where name = 'retry-two'
    ),
    (
      select (response->>'claim_token')::uuid
      from push_claim_results where name = 'retry-two'
    ),
    'transient_failure',
    5,
    'network',
    60
  ),
  true,
  'attempt two may schedule the final retry'
);

update public.push_deliveries
set next_attempt_at = now() - interval '1 second'
where reminder_kind = 'daily_quest';
insert into push_claim_results values (
  'retry-three',
  public.claim_push_delivery(
    'b1100000-0000-4000-8000-000000000011',
    'b1000000-0000-4000-8000-000000000001',
    'daily_quest',
    current_date,
    now()
  )
);
select is(
  (select response->>'attempt' from push_claim_results where name = 'retry-three'),
  '3',
  'the final bounded retry advances to attempt three'
);
select is(
  public.complete_push_delivery(
    (
      select (response->>'delivery_id')::uuid
      from push_claim_results where name = 'retry-three'
    ),
    (
      select (response->>'claim_token')::uuid
      from push_claim_results where name = 'retry-three'
    ),
    'transient_failure',
    5,
    'provider',
    60
  ),
  true,
  'attempt three closes rather than scheduling an unbounded retry'
);
select is(
  (
    select status || ':' || outcome_category
    from public.push_deliveries
    where reminder_kind = 'daily_quest'
  ),
  'permanent_failure:retry_exhausted',
  'retry exhaustion is explicit and bounded'
);
select is(
  (
    select transient_failures
    from public.push_subscriptions
    where id = 'b1100000-0000-4000-8000-000000000011'
  ),
  3,
  'bounded transient attempts update subscription posture atomically'
);

insert into push_claim_results values (
  'expired-endpoint',
  public.claim_push_delivery(
    'b1100000-0000-4000-8000-000000000011',
    'b1000000-0000-4000-8000-000000000001',
    'prayer_reminder',
    current_date,
    now()
  )
);
select is(
  public.complete_push_delivery(
    (
      select (response->>'delivery_id')::uuid
      from push_claim_results where name = 'expired-endpoint'
    ),
    (
      select (response->>'claim_token')::uuid
      from push_claim_results where name = 'expired-endpoint'
    ),
    'permanent_failure',
    4,
    'expired',
    300
  ),
  true,
  'expired endpoint completion succeeds'
);
select is(
  (
    select count(*)
    from public.push_subscriptions
    where id = 'b1100000-0000-4000-8000-000000000011'
  ),
  0::bigint,
  'expired endpoint removal is atomic with completion'
);
select is(
  (
    select subscription_id is null
    from public.push_deliveries
    where reminder_kind = 'prayer_reminder'
  ),
  true,
  'expired endpoint removal preserves the bounded delivery metric'
);

select is(
  public.claim_push_test(
    'b1000000-0000-4000-8000-000000000001'
  )->>'claimed',
  'true',
  'the first neutral test notification is allowed'
);
select is(
  public.claim_push_test(
    'b1000000-0000-4000-8000-000000000001'
  )->>'claimed',
  'false',
  'a rapid duplicate test notification is throttled'
);
update public.push_test_claims
set last_claimed_at = now() - interval '6 minutes'
where user_id = 'b1000000-0000-4000-8000-000000000001';
select is(
  public.claim_push_test(
    'b1000000-0000-4000-8000-000000000001'
  )->>'claimed',
  'true',
  'the test throttle reopens after five minutes'
);

reset role;
set role postgres;
set local role anon;
select is(
  public.push_reminder_contract(),
  '{"contract":"biblequest_private_push_v1","ok":true}'::jsonb,
  'anonymous readiness remains fixed and content-free'
);

reset role;
set role postgres;
delete from auth.users
where id = 'b1000000-0000-4000-8000-000000000001';
select is(
  (
    select count(*) from public.push_reminder_preferences
    where user_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'account deletion removes reminder preferences'
);
select is(
  (
    select count(*) from public.push_subscriptions
    where user_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'account deletion removes encrypted subscriptions'
);
select is(
  (
    select count(*) from public.push_deliveries
    where user_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'account deletion removes delivery metrics'
);
select is(
  (
    select count(*) from public.push_test_claims
    where user_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'account deletion removes test throttle state'
);

select * from finish();
rollback;
