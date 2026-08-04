-- Refuses partial Arcade-store state and requires the reviewed 0035 boundary.
do $arcade_before$
begin
  if public.provider_rate_limit_contract() is distinct from
     '{"contract":"biblequest_provider_rate_limit_v2","ok":true}'::jsonb then
    raise exception 'production Arcade store prerequisite is invalid';
  end if;

  if pg_catalog.to_regclass('public.arcade_orders') is not null
     or pg_catalog.to_regclass('public.arcade_question_skip_redemptions') is not null
     or pg_catalog.to_regprocedure(
       'public.consume_arcade_question_skip(uuid,text)'
     ) is not null
     or pg_catalog.to_regprocedure('public.arcade_store_contract()') is not null then
    raise exception 'production Arcade store found a partial 0036 schema';
  end if;
end;
$arcade_before$;
