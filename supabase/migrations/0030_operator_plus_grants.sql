-- Store manual Plus access separately from provider-authoritative billing rows.
create table public.operator_plus_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  duration_key text not null,
  reason text not null,
  granted_by_user_id uuid references auth.users(id) on delete set null,
  granted_by_email text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  revoked_by_email text,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_plus_duration_check check (
    duration_key in ('7d', '30d', '365d', 'lifetime')
  ),
  constraint operator_plus_reason_check check (
    reason = pg_catalog.btrim(reason)
    and pg_catalog.length(reason) between 3 and 240
    and reason !~ '[[:cntrl:]]'
  ),
  constraint operator_plus_grant_email_check check (
    granted_by_email = pg_catalog.lower(pg_catalog.btrim(granted_by_email))
    and pg_catalog.length(granted_by_email) between 3 and 254
    and granted_by_email ~
      '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  ),
  constraint operator_plus_expiry_check check (
    (duration_key = 'lifetime' and expires_at is null)
    or (
      duration_key <> 'lifetime'
      and expires_at is not null
      and expires_at > starts_at
    )
  ),
  constraint operator_plus_revocation_check check (
    (
      revoked_at is null
      and revoked_by_email is null
      and revocation_reason is null
    )
    or (
      revoked_at is not null
      and revoked_by_email is not null
      and revocation_reason is not null
      and revoked_at >= starts_at
      and revoked_by_email =
        pg_catalog.lower(pg_catalog.btrim(revoked_by_email))
      and pg_catalog.length(revoked_by_email) between 3 and 254
      and revoked_by_email ~
        '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
      and revocation_reason = pg_catalog.btrim(revocation_reason)
      and pg_catalog.length(revocation_reason) between 3 and 240
      and revocation_reason !~ '[[:cntrl:]]'
    )
  ),
  constraint operator_plus_updated_check check (updated_at >= created_at)
);

-- Keep complete history while allowing only one unsuperseded grant per account.
create unique index operator_plus_grants_open_user_idx
  on public.operator_plus_grants (user_id)
  where revoked_at is null;
create index operator_plus_grants_active_idx
  on public.operator_plus_grants (user_id, expires_at)
  where revoked_at is null;
create index operator_plus_grants_created_idx
  on public.operator_plus_grants (created_at desc);

alter table public.operator_plus_grants enable row level security;
alter table public.operator_plus_grants force row level security;

-- The service can read entitlement state, but all writes stay behind sealed RPCs.
revoke all on table public.operator_plus_grants
  from public, anon, authenticated, service_role;
grant select on table public.operator_plus_grants to service_role;

-- Replaces an open manual grant and records the operator event atomically.
create or replace function public.grant_operator_plus(
  p_target_user_id uuid,
  p_duration_key text,
  p_reason text,
  p_operator_user_id uuid,
  p_operator_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  action_at timestamptz := pg_catalog.clock_timestamp();
  normalized_operator_email text :=
    pg_catalog.lower(pg_catalog.btrim(p_operator_email));
  normalized_reason text := pg_catalog.btrim(p_reason);
  grant_expires_at timestamptz;
  inserted_grant public.operator_plus_grants%rowtype;
begin
  if p_target_user_id is null
     or p_operator_user_id is null
     or p_duration_key is null
     or p_duration_key not in ('7d', '30d', '365d', 'lifetime')
     or normalized_reason is null
     or pg_catalog.length(normalized_reason) not between 3 and 240
     or normalized_reason ~ '[[:cntrl:]]'
     or normalized_operator_email is null
     or pg_catalog.length(normalized_operator_email) not between 3 and 254
     or normalized_operator_email !~
       '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  then
    raise exception 'operator Plus grant: invalid input'
      using errcode = '22023';
  end if;

  perform 1
  from auth.users
  where id = p_target_user_id
  for update;
  if not found then
    raise exception 'operator Plus grant: account unavailable'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = p_operator_user_id
      and pg_catalog.lower(email) = normalized_operator_email
  ) then
    raise exception 'operator Plus grant: operator unavailable'
      using errcode = '22023';
  end if;

  grant_expires_at := case p_duration_key
    when '7d' then action_at + interval '7 days'
    when '30d' then action_at + interval '30 days'
    when '365d' then action_at + interval '365 days'
    else null
  end;

  update public.operator_plus_grants
  set
    revoked_at = action_at,
    revoked_by_user_id = p_operator_user_id,
    revoked_by_email = normalized_operator_email,
    revocation_reason = 'Superseded by a new operator grant.',
    updated_at = action_at
  where user_id = p_target_user_id
    and revoked_at is null;

  insert into public.operator_plus_grants (
    user_id,
    duration_key,
    reason,
    granted_by_user_id,
    granted_by_email,
    starts_at,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_target_user_id,
    p_duration_key,
    normalized_reason,
    p_operator_user_id,
    normalized_operator_email,
    action_at,
    grant_expires_at,
    action_at,
    action_at
  )
  returning * into inserted_grant;

  insert into public.console_audit_logs (
    operator_user_id,
    operator_email,
    action,
    target_type,
    target_key,
    outcome,
    details,
    created_at
  )
  values (
    p_operator_user_id,
    normalized_operator_email,
    'entitlement.plus_grant',
    'account',
    p_target_user_id::text,
    'succeeded',
    pg_catalog.jsonb_build_object(
      'duration', p_duration_key,
      'expires_at', coalesce(grant_expires_at::text, 'lifetime')
    ),
    action_at
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'grant_id', inserted_grant.id,
    'user_id', inserted_grant.user_id,
    'duration', inserted_grant.duration_key,
    'expires_at', inserted_grant.expires_at
  );
end;
$function$;

-- Revokes only manual access and never changes a Stripe subscription.
create or replace function public.revoke_operator_plus(
  p_target_user_id uuid,
  p_reason text,
  p_operator_user_id uuid,
  p_operator_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  action_at timestamptz := pg_catalog.clock_timestamp();
  normalized_operator_email text :=
    pg_catalog.lower(pg_catalog.btrim(p_operator_email));
  normalized_reason text := pg_catalog.btrim(p_reason);
  revoked_grant public.operator_plus_grants%rowtype;
begin
  if p_target_user_id is null
     or p_operator_user_id is null
     or normalized_reason is null
     or pg_catalog.length(normalized_reason) not between 3 and 240
     or normalized_reason ~ '[[:cntrl:]]'
     or normalized_operator_email is null
     or pg_catalog.length(normalized_operator_email) not between 3 and 254
     or normalized_operator_email !~
       '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  then
    raise exception 'operator Plus revoke: invalid input'
      using errcode = '22023';
  end if;

  perform 1
  from auth.users
  where id = p_target_user_id
  for update;
  if not found then
    raise exception 'operator Plus revoke: account unavailable'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = p_operator_user_id
      and pg_catalog.lower(email) = normalized_operator_email
  ) then
    raise exception 'operator Plus revoke: operator unavailable'
      using errcode = '22023';
  end if;

  update public.operator_plus_grants
  set
    revoked_at = action_at,
    revoked_by_user_id = p_operator_user_id,
    revoked_by_email = normalized_operator_email,
    revocation_reason = normalized_reason,
    updated_at = action_at
  where user_id = p_target_user_id
    and revoked_at is null
  returning * into revoked_grant;

  if not found then
    raise exception 'operator Plus revoke: no open grant'
      using errcode = '22023';
  end if;

  insert into public.console_audit_logs (
    operator_user_id,
    operator_email,
    action,
    target_type,
    target_key,
    outcome,
    details,
    created_at
  )
  values (
    p_operator_user_id,
    normalized_operator_email,
    'entitlement.plus_revoke',
    'account',
    p_target_user_id::text,
    'succeeded',
    pg_catalog.jsonb_build_object(
      'duration', revoked_grant.duration_key,
      'was_expired',
        revoked_grant.expires_at is not null
        and revoked_grant.expires_at <= action_at
    ),
    action_at
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'grant_id', revoked_grant.id,
    'user_id', revoked_grant.user_id,
    'revoked_at', revoked_grant.revoked_at
  );
end;
$function$;

alter function public.grant_operator_plus(
  uuid, text, text, uuid, text
) owner to postgres;
alter function public.revoke_operator_plus(
  uuid, text, uuid, text
) owner to postgres;

revoke all on function public.grant_operator_plus(
  uuid, text, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.revoke_operator_plus(
  uuid, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.grant_operator_plus(
  uuid, text, text, uuid, text
) to service_role;
grant execute on function public.revoke_operator_plus(
  uuid, text, uuid, text
) to service_role;

-- Exposes a fixed readiness result without exposing any account or grant row.
create or replace function public.operator_plus_grant_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with table_posture as (
  select
    class.relrowsecurity
    and class.relforcerowsecurity
    and not exists (
      select 1
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'operator_plus_grants'
    )
    and not pg_catalog.has_table_privilege(
      'anon',
      'public.operator_plus_grants',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.operator_plus_grants',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'
    )
    and pg_catalog.has_table_privilege(
      'service_role',
      'public.operator_plus_grants',
      'SELECT'
    )
    and not pg_catalog.has_table_privilege(
      'service_role',
      'public.operator_plus_grants',
      'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'
    ) as ok
  from pg_catalog.pg_class as class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'operator_plus_grants'
    and class.relkind = 'r'
), expected_functions(signature) as (
  values
    ('public.grant_operator_plus(uuid,text,text,uuid,text)'),
    ('public.revoke_operator_plus(uuid,text,uuid,text)')
), function_posture as (
  select
    pg_catalog.count(*) = 2
    and pg_catalog.bool_and(
      procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
      and pg_catalog.has_function_privilege(
        'service_role', procedure.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated', procedure.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon', procedure.oid, 'EXECUTE'
      )
    ) as ok
  from expected_functions
  join pg_catalog.pg_proc as procedure
    on procedure.oid =
      pg_catalog.to_regprocedure(expected_functions.signature)
)
select pg_catalog.jsonb_build_object(
  'contract', 'biblequest_operator_plus_grant_v1',
  'ok',
    coalesce((select ok from table_posture), false)
    and coalesce((select ok from function_posture), false)
);
$function$;

alter function public.operator_plus_grant_contract() owner to postgres;
revoke all on function public.operator_plus_grant_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.operator_plus_grant_contract()
  to anon, authenticated, service_role;
