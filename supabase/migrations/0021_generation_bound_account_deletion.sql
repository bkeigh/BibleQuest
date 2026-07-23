-- Account deletion is a trusted destructive transaction. Bind the existing
-- sync guards to the current user and generation, purge owned rows in a known
-- order, then remove the Auth identity and its retained sync state.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  current_generation bigint;
begin
  if uid is null then
    raise exception 'account deletion: not authenticated'
      using errcode = '42501';
  end if;

  select generation
  into current_generation
  from public.user_sync_state
  where user_id = uid
  for update;

  if current_generation is null then
    raise exception 'account deletion: sync state unavailable'
      using errcode = '40001';
  end if;

  perform pg_catalog.set_config(
    'biblequest.sync_expected_user',
    uid::text,
    true
  );
  perform pg_catalog.set_config(
    'biblequest.sync_generation',
    current_generation::text,
    true
  );

  perform public.purge_user_data_internal();

  delete from auth.users
  where id = uid;

  if not found then
    raise exception 'account deletion: authenticated user unavailable'
      using errcode = '42501';
  end if;
end;
$function$;

alter function public.delete_own_account() owner to postgres;
revoke all on function public.delete_own_account()
  from public, anon, authenticated, service_role;
grant execute on function public.delete_own_account()
  to authenticated;

-- Expose a content-free release gate proving the real-user deletion path is
-- generation-bound and still sealed to authenticated callers.
create or replace function public.account_deletion_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
select pg_catalog.jsonb_build_object(
  'contract', 'generation_bound_account_deletion_v1',
  'ready',
    pg_catalog.to_regprocedure('public.delete_own_account()') is not null
    and pg_catalog.to_regprocedure(
      'public.purge_user_data_internal()'
    ) is not null
    and (
      select procedure.prosecdef
        and procedure.proconfig = array['search_path=""']::text[]
        and procedure.prosrc like '%biblequest.sync_expected_user%'
        and procedure.prosrc like '%biblequest.sync_generation%'
        and procedure.prosrc like '%purge_user_data_internal%'
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.delete_own_account()'
      )
    )
    and pg_catalog.has_function_privilege(
      'authenticated',
      'public.delete_own_account()',
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon',
      'public.delete_own_account()',
      'EXECUTE'
    )
);
$function$;

revoke all on function public.account_deletion_contract()
  from public, authenticated, service_role;
grant execute on function public.account_deletion_contract()
  to anon;
