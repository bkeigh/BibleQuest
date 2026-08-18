-- Require exact schema 0036 and reject native or partial deletion hardening.
do $web_deletion_before$
declare
  delete_source text;
  setter_source text;
begin
  if public.arcade_store_contract() is distinct from
       '{"contract":"biblequest_arcade_store_v1","ok":true}'::jsonb
     or public.profile_avatar_contract() is distinct from
       '{"contract":"biblequest_profile_avatar_v1","ok":true}'::jsonb
     or public.account_deletion_contract() is distinct from
       '{"contract":"generation_bound_account_deletion_v2","ready":true}'::jsonb then
    raise exception 'web account deletion prerequisite contract is invalid';
  end if;

  if pg_catalog.to_regprocedure(
       'public.native_account_beta_availability()'
     ) is not null
     or exists (
       select 1
       from public.feature_flags
       where key = 'native_account_beta'
     ) then
    raise exception 'native account migration must remain separate';
  end if;

  if pg_catalog.to_regclass(
       'public.account_deletion_latches'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.avatar_upload_allowed()'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.begin_own_account_deletion()'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.account_deletion_storage_contract()'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.own_account_deletion_status()'
     ) is not null
     or exists (
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
       where policy.schemaname = 'storage'
         and policy.tablename = 'objects'
         and policy.policyname = 'profile avatars: account deletion guard'
     )
     or exists (
       select 1
       from pg_catalog.pg_policies as policy
       where policy.policyname like 'web account protocol:%'
          or policy.policyname like 'profile avatars: web protocol%'
     ) then
    raise exception 'web account deletion found a partial hardened schema';
  end if;

  select procedure.prosrc
  into delete_source
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.delete_own_account()'
  );
  select procedure.prosrc
  into setter_source
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.set_profile_avatar(text,uuid)'
  );
  if delete_source is null
     or delete_source like '%from storage.objects%'
     or setter_source is null
     or setter_source like '%avatar_upload_allowed%'
     or not exists (
       select 1
       from pg_catalog.pg_policies as policy
       where policy.schemaname = 'storage'
         and policy.tablename = 'objects'
         and policy.policyname = 'profile avatars: upload own'
         and policy.cmd = 'INSERT'
         and policy.roles = array['authenticated']::name[]
         and coalesce(policy.with_check, '') not like
           '%avatar_upload_allowed%'
     ) then
    raise exception 'web account deletion baseline is invalid';
  end if;
end;
$web_deletion_before$;
