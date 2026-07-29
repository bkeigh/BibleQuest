-- Require the exact legacy Dispute prefix before replacing it with Stripe's
-- current `du_` object prefix.
do $biblequest_production_stripe_dispute_preflight$
declare
  legacy_constraint_count integer;
begin
  select pg_catalog.count(*)::integer
  into legacy_constraint_count
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.stripe_billing_signals'::regclass
    and constraint_record.conname = 'stripe_signal_object_check'
    and constraint_record.contype = 'c'
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_record.oid),
      '^(in|re|dp)_[A-Za-z0-9]+$'
    ) > 0
    and pg_catalog.strpos(
      pg_catalog.pg_get_constraintdef(constraint_record.oid),
      '^(in|re|du)_[A-Za-z0-9]+$'
    ) = 0;

  if legacy_constraint_count <> 1 then
    raise exception 'production Stripe correction found a partial 0032 schema';
  end if;
end;
$biblequest_production_stripe_dispute_preflight$;
