-- Prove the Storage-safe web boundary without installing native availability.
do $web_deletion_after$
begin
  if public.account_deletion_storage_contract() is distinct from
       '{"contract":"biblequest_account_deletion_storage_v1","ok":true}'::jsonb
     or public.account_deletion_contract() is distinct from
       '{"contract":"generation_bound_account_deletion_v2","ready":true}'::jsonb
     or public.profile_avatar_contract() is distinct from
       '{"contract":"biblequest_profile_avatar_v1","ok":true}'::jsonb then
    raise exception 'web account deletion hardened contract is invalid';
  end if;

  if exists (
       select 1
       from information_schema.columns as column_record
       where column_record.table_schema = 'public'
         and column_record.table_name = 'user_sync_state'
         and column_record.column_name = 'web_protocol_version'
     )
     or pg_catalog.to_regprocedure(
       'public.adopt_web_account_protocol_v2()'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.web_account_protocol_contract()'
     ) is not null
     or exists (
       select 1
       from pg_catalog.pg_policies as policy
       where policy.policyname like 'web account protocol:%'
          or policy.policyname like 'profile avatars: web protocol%'
     ) then
    raise exception 'web hardening unexpectedly installed provider adoption';
  end if;

  if pg_catalog.to_regprocedure(
       'public.native_account_beta_availability()'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.native_account_beta_request_allowed()'
     ) is not null
     or exists (
       select 1
       from public.feature_flags
       where key = 'native_account_beta'
     ) then
    raise exception 'web hardening unexpectedly installed native availability';
  end if;
end;
$web_deletion_after$;
