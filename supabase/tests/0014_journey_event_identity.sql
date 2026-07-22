-- Exercise migration 0014 backfill, compatibility, and identity guarantees.
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- Keep disposable identifiers inside the transaction and out of test output.
create temporary table journey_test_context (
  owner_id uuid not null,
  backfill_event_id uuid not null,
  legacy_event_id uuid not null,
  current_event_id uuid not null,
  second_legacy_event_id uuid not null
) on commit drop;

insert into journey_test_context
select
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid();

insert into auth.users (id, raw_user_meta_data, created_at, updated_at)
select owner_id, '{}'::jsonb, now(), now()
from journey_test_context;

-- Verify the durable post-migration schema before replaying the backfill state.
select has_column(
  'public',
  'journey_events',
  'date_key',
  'Journey events expose date_key'
);
select has_column(
  'public',
  'journey_events',
  'source_id',
  'Journey events expose source_id'
);
select col_not_null(
  'public',
  'journey_events',
  'date_key',
  'Journey date_key is not nullable'
);
select has_trigger(
  'public',
  'journey_events',
  'ensure_journey_event_date_key',
  'Cached clients receive the date fallback trigger'
);
select has_index(
  'public',
  'journey_events',
  'idx_journey_user_date',
  'Journey owner/date lookup index exists'
);

-- Recreate a pre-0014 row, then execute the reviewed backfill expression.
alter table public.journey_events
  alter column date_key drop not null,
  disable trigger ensure_journey_event_date_key;

insert into public.journey_events (
  id,
  user_id,
  event_type,
  title,
  occurred_at,
  date_key
)
select
  backfill_event_id,
  owner_id,
  'prayer_created',
  'Synthetic backfill event',
  '2026-07-17 00:30:00+02'::timestamptz,
  null
from journey_test_context;

select is(
  (select count(*)
   from public.journey_events
   where date_key is null),
  1::bigint,
  'Pre-migration fixture contains one missing date'
);

update public.journey_events
set date_key = (occurred_at at time zone 'UTC')::date
where date_key is null;

select is(
  (select event.date_key
   from public.journey_events as event
   join journey_test_context as context
     on context.backfill_event_id = event.id),
  '2026-07-16'::date,
  'Backfill derives the deterministic UTC date'
);
select is(
  (select count(*)
   from public.journey_events
   where date_key is null),
  0::bigint,
  'Backfill leaves no missing Journey dates'
);

alter table public.journey_events
  enable trigger ensure_journey_event_date_key,
  alter column date_key set not null;

select col_not_null(
  'public',
  'journey_events',
  'date_key',
  'Backfilled rows permit the not-null contract'
);

-- Exercise a cached write that omits both new identity columns.
insert into public.journey_events (
  id,
  user_id,
  event_type,
  title,
  occurred_at
)
select
  legacy_event_id,
  owner_id,
  'reflection_written',
  'Synthetic legacy event',
  '2026-07-18 01:15:00+03'::timestamptz
from journey_test_context;

select is(
  (select event.date_key
   from public.journey_events as event
   join journey_test_context as context
     on context.legacy_event_id = event.id),
  '2026-07-17'::date,
  'Cached write receives the UTC fallback date'
);
select is(
  (select event.source_id
   from public.journey_events as event
   join journey_test_context as context
     on context.legacy_event_id = event.id),
  null,
  'Cached write may retain a null historical source'
);

-- Exercise a current write with its source-local date and stable source key.
insert into public.journey_events (
  id,
  user_id,
  event_type,
  title,
  occurred_at,
  date_key,
  source_id
)
select
  current_event_id,
  owner_id,
  'prayer_created',
  'Synthetic current event',
  '2026-07-19 01:30:00+00'::timestamptz,
  '2026-07-18'::date,
  'prayer:synthetic-source'
from journey_test_context;

select is(
  (select event.date_key
   from public.journey_events as event
   join journey_test_context as context
     on context.current_event_id = event.id),
  '2026-07-18'::date,
  'Current write preserves the source-local date'
);
select is(
  (select event.source_id
   from public.journey_events as event
   join journey_test_context as context
     on context.current_event_id = event.id),
  'prayer:synthetic-source',
  'Current write preserves the stable source key'
);

-- The append-only sync conflict target remains the existing primary key.
select throws_ok(
  format(
    'insert into public.journey_events (id,user_id,event_type,title,occurred_at) values (%L,%L,%L,%L,%L)',
    (select current_event_id from journey_test_context),
    (select owner_id from journey_test_context),
    'prayer_created',
    'Synthetic duplicate event',
    '2026-07-19 01:30:00+00'
  ),
  '23505',
  null,
  'Journey event primary keys remain unique'
);

-- Multiple historical rows without a recoverable source remain compatible.
insert into public.journey_events (
  id,
  user_id,
  event_type,
  title,
  occurred_at
)
select
  second_legacy_event_id,
  owner_id,
  'reflection_written',
  'Synthetic second legacy event',
  '2026-07-18 02:15:00+03'::timestamptz
from journey_test_context;

select is(
  (select count(*)
   from public.journey_events as event
   join journey_test_context as context
     on context.owner_id = event.user_id
   where event.source_id is null),
  3::bigint,
  'Historical source-less events remain valid and distinct'
);

select * from finish();

rollback;
