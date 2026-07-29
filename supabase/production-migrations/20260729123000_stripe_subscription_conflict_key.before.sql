-- Refuse the production correction unless the complete 0030 baseline is
-- healthy, the old partial index is intact, and existing values are unique.
do $biblequest_production_stripe_conflict_preflight$
begin
  if public.stripe_billing_contract() is distinct from
    '{"contract":"biblequest_stripe_test_billing_v2","ok":true}'::jsonb
    or public.stripe_support_contract() is distinct from
      '{"contract":"biblequest_stripe_one_time_support_v1","ok":true}'::jsonb
    or public.operator_plus_grant_contract() is distinct from
      '{"contract":"biblequest_operator_plus_grant_v1","ok":true}'::jsonb
  then
    raise exception 'production Stripe correction baseline is invalid';
  end if;

  if pg_catalog.to_regclass(
    'public.subscriptions_external_subscription_idx'
  ) is null
    or exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = 'public.subscriptions'::regclass
        and conname = 'subscriptions_external_subscription_key'
    )
  then
    raise exception 'production Stripe correction found a partial 0031 schema';
  end if;

  if exists (
    select external_subscription_id
    from public.subscriptions
    where external_subscription_id is not null
    group by external_subscription_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'production Stripe subscription identifiers are duplicated';
  end if;
end;
$biblequest_production_stripe_conflict_preflight$;
