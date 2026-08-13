-- Abort if Production already contains a partial native account rollout.
do $gate$
begin
  if pg_catalog.to_regprocedure(
       'public.native_account_beta_availability()'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.native_account_beta_request_allowed()'
     ) is not null
     or pg_catalog.to_regclass(
       'public.account_deletion_latches'
     ) is not null
     or exists (
       select 1
       from public.feature_flags
       where key = 'native_account_beta'
     )
     or exists (
       select 1
       from pg_catalog.pg_policies
       where policyname = 'native account beta availability'
     )
     or exists (
       select 1
       from pg_catalog.pg_trigger
       where tgname = 'enforce_native_account_beta_availability'
         and not tgisinternal
     ) then
    raise exception 'native account production precondition failed';
  end if;

  if pg_catalog.to_regprocedure(
       'public.delete_user_sync_rows(uuid,bigint,uuid,jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.delete_user_sync_rows_internal(uuid,bigint,uuid,jsonb)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.purge_user_data(uuid,bigint,uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.purge_user_data_internal(uuid,bigint,uuid)'
     ) is not null
     or coalesce(
       (public.account_deletion_contract()->>'ready')::boolean,
       false
     ) is not true
     or coalesce(
       (public.profile_avatar_contract()->>'ok')::boolean,
       false
     ) is not true
     or coalesce(
       (public.guided_progress_sync_contract()->>'ok')::boolean,
       false
     ) is not true then
    raise exception 'native account prerequisite contract failed';
  end if;
end;
$gate$;
