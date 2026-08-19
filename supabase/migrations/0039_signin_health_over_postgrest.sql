-- Move the sign-in monitor off GoTrue's admin API and onto the channel that
-- actually works from the deployment.
--
-- /auth/v1/admin/users answers 403 from production with a Cloudflare HTML
-- block page — not a GoTrue JSON error — whatever header shape the secret key
-- travels in. Four revisions argued about apikey vs bearer before the response
-- body was ever logged; it was never a header. PostgREST from the same egress
-- is fine, which is how every other server feature in this app already reaches
-- Supabase, so the monitor reads its two columns over that channel instead.
--
-- Returns timestamps only — no id, no email, nothing that names a person. The
-- assessment stays in application code, where it is already tested against a
-- fixed clock, so this function decides nothing.
create or replace function public.signin_health_accounts()
returns table (created_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select u.created_at, u.last_sign_in_at
  from auth.users u;
$function$;

-- The monitor runs as service_role and nobody else needs this. anon and
-- authenticated are deliberately absent: signed-in people must not be able to
-- count the accounts that never got in.
revoke execute on function public.signin_health_accounts() from public;
revoke execute on function public.signin_health_accounts() from anon, authenticated;
grant execute on function public.signin_health_accounts() to service_role;
