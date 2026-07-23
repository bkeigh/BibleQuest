-- Let an authenticated person close only the account represented by the
-- current JWT. auth.users cascades remove every user-owned public row.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'account deletion: not authenticated'
      using errcode = '42501';
  end if;

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
