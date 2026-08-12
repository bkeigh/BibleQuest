-- Prove the lease table and service-role-only projection API are complete.
do $gate$
begin
  if pg_catalog.to_regclass('public.stripe_projection_leases') is null
     or pg_catalog.to_regprocedure(
       'public.claim_stripe_projection(text,integer)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.release_stripe_projection(text,uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.commit_stripe_projection(text,uuid,jsonb)'
     ) is null then
    raise exception 'Stripe projection contract is incomplete';
  end if;
  if pg_catalog.has_table_privilege(
       'anon',
       'public.stripe_projection_leases',
       'select'
     ) or pg_catalog.has_table_privilege(
       'authenticated',
       'public.stripe_projection_leases',
       'select'
     ) or not pg_catalog.has_table_privilege(
       'service_role',
       'public.stripe_projection_leases',
       'select'
     ) then
    raise exception 'Stripe projection grants are unsafe';
  end if;
end;
$gate$;
