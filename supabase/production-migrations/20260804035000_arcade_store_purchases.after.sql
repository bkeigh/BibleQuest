-- Proves the complete sealed Arcade-store boundary after the packet applies.
do $arcade_after$
declare
  orders_rls boolean;
  orders_force_rls boolean;
  redemptions_rls boolean;
  redemptions_force_rls boolean;
begin
  if public.arcade_store_contract() is distinct from
     '{"contract":"biblequest_arcade_store_v1","ok":true}'::jsonb then
    raise exception 'production Arcade store contract is invalid';
  end if;

  select relrowsecurity, relforcerowsecurity
  into orders_rls, orders_force_rls
  from pg_catalog.pg_class
  where oid = 'public.arcade_orders'::regclass;

  select relrowsecurity, relforcerowsecurity
  into redemptions_rls, redemptions_force_rls
  from pg_catalog.pg_class
  where oid = 'public.arcade_question_skip_redemptions'::regclass;

  if not orders_rls or not orders_force_rls
     or not redemptions_rls or not redemptions_force_rls then
    raise exception 'production Arcade store RLS boundary is invalid';
  end if;

  if pg_catalog.has_table_privilege(
       'authenticated', 'public.arcade_orders', 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon', 'public.arcade_orders', 'SELECT'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.consume_arcade_question_skip(uuid,text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.consume_arcade_question_skip(uuid,text)',
       'EXECUTE'
     ) then
    raise exception 'production Arcade store grants are invalid';
  end if;
end;
$arcade_after$;
