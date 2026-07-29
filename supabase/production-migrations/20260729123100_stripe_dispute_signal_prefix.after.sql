-- Prove the deployed signal constraint accepts only the reviewed current
-- invoice, refund, and Dispute object prefixes.
do $biblequest_production_stripe_dispute_postflight$
declare
  current_constraint_count integer;
begin
  select pg_catalog.count(*)::integer
  into current_constraint_count
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.stripe_billing_signals'::regclass
    and constraint_record.conname = 'stripe_signal_object_check'
    and constraint_record.contype = 'c'
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_record.oid),
      '^(in|re|du)_[A-Za-z0-9]+$'
    ) > 0
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_record.oid),
      '^(in|re|dp)_[A-Za-z0-9]+$'
    ) = 0;

  if current_constraint_count <> 1
    or public.stripe_billing_contract() is distinct from
      '{"contract":"biblequest_stripe_test_billing_v2","ok":true}'::jsonb
  then
    raise exception 'production 0032 dispute signal posture is invalid';
  end if;
end;
$biblequest_production_stripe_dispute_postflight$;
