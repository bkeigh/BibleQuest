-- Prove both native contracts, their remote flags, and the RLS guard exist.
do $gate$
declare
  helper_source text;
begin
  if not exists (
    select 1 from public.feature_flags
    where key = 'native_account_beta' and enabled = false
  ) or not exists (
    select 1 from public.feature_flags
    where key = 'native_account_us_release' and enabled = false
  ) then
    raise exception 'native account flags were not installed fail-closed';
  end if;
  select procedure.prosrc into helper_source
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.native_account_beta_request_allowed()'
  );
  if helper_source is null
     or helper_source not like '%x-biblequest-native-account-beta%'
     or helper_source not like '%x-biblequest-native-account-us-release%'
     or pg_catalog.to_regclass('public.account_deletion_latches') is null then
    raise exception 'native account request boundary is incomplete';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') like '%native_account_beta_request_allowed%'
      and coalesce(with_check, '') like '%native_account_beta_request_allowed%'
  ) then
    raise exception 'native account RLS boundary is missing';
  end if;
end;
$gate$;
