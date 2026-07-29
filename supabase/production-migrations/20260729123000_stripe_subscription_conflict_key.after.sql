-- Prove the full unique constraint replaced the incompatible partial index.
do $biblequest_production_stripe_conflict_postflight$
declare
  constraint_count integer;
begin
  select pg_catalog.count(*)::integer
  into constraint_count
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.subscriptions'::regclass
    and constraint_record.conname =
      'subscriptions_external_subscription_key'
    and constraint_record.contype = 'u'
    and (
      select pg_catalog.array_agg(attribute.attname order by key.ordinality)
      from pg_catalog.unnest(
        constraint_record.conkey
      ) with ordinality as key(attnum, ordinality)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = constraint_record.conrelid
        and attribute.attnum = key.attnum
    ) = array['external_subscription_id']::name[];

  if constraint_count <> 1
    or pg_catalog.to_regclass(
      'public.subscriptions_external_subscription_idx'
    ) is not null
  then
    raise exception 'production 0031 subscription conflict posture is invalid';
  end if;
end;
$biblequest_production_stripe_conflict_postflight$;
