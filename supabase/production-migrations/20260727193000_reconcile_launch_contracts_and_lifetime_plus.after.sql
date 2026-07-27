-- Prove the transaction installed the complete sealed lifetime billing boundary.
do $biblequest_production_postflight$
declare
  contract_value jsonb;
begin
  contract_value := public.stripe_billing_contract();
  if contract_value <> pg_catalog.jsonb_build_object(
    'contract', 'biblequest_stripe_test_billing_v2',
    'ok', true
  ) then
    raise exception 'production Stripe v2 contract verification failed';
  end if;
end;
$biblequest_production_postflight$;
