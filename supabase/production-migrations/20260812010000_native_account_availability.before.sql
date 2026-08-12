-- Abort if production already contains a partial native account rollout.
do $gate$
begin
  if pg_catalog.to_regprocedure('public.native_account_beta_availability()') is not null
     or pg_catalog.to_regclass('public.account_deletion_latches') is not null
     or exists (
       select 1 from public.feature_flags
       where key in ('native_account_beta', 'native_account_us_release')
     ) then
    raise exception 'native account production precondition failed';
  end if;
end;
$gate$;
