begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.stripe_billing_signals'::regclass
      and conname = 'stripe_signal_object_check'
      and contype = 'c'
  ),
  'the bounded Stripe signal object constraint exists'
);

select matches(
  (
    select pg_catalog.pg_get_constraintdef(oid)
    from pg_catalog.pg_constraint
    where conrelid = 'public.stripe_billing_signals'::regclass
      and conname = 'stripe_signal_object_check'
  ),
  'du',
  'the signal constraint accepts Stripe Dispute object prefixes'
);

set local role service_role;

-- A signal must reference a claimed event, matching the production write path.
insert into public.stripe_webhook_events (
  event_id,
  event_type,
  event_created,
  livemode,
  status,
  claim_token,
  processed_at
) values (
  'evt_TestDisputeSignal032',
  'charge.dispute.created',
  1785303008,
  false,
  'processed',
  '03200000-0000-4000-8000-000000000001',
  now()
);

select lives_ok(
  $$insert into public.stripe_billing_signals (
      event_id,
      signal_kind,
      stripe_object_id,
      status,
      amount,
      currency,
      occurred_at
    ) values (
      'evt_TestDisputeSignal032',
      'dispute',
      'du_TestDisputeSignal032',
      'needs_response',
      14499,
      'usd',
      now()
    )$$,
  'a current Stripe Dispute object can be stored as a bounded signal'
);

select throws_ok(
  $$update public.stripe_billing_signals
    set stripe_object_id = 'dp_LegacyWrongPrefix032'
    where event_id = 'evt_TestDisputeSignal032'$$,
  '23514',
  null,
  'an invalid dispute prefix still fails closed'
);

select * from finish();
rollback;
