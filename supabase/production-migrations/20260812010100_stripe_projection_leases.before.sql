-- Abort if production already contains a partial Stripe projection rollout.
do $gate$
begin
  if pg_catalog.to_regclass('public.stripe_projection_leases') is not null
     or pg_catalog.to_regprocedure(
       'public.claim_stripe_projection(text,integer)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.commit_stripe_projection(text,uuid,jsonb)'
     ) is not null then
    raise exception 'Stripe projection production precondition failed';
  end if;
  if pg_catalog.to_regclass('public.stripe_webhook_events') is null then
    raise exception 'Stripe webhook prerequisite is missing';
  end if;
end;
$gate$;
