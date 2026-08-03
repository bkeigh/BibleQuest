begin;

set role postgres;
grant usage on schema extensions to public;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select is(
  public.provider_rate_limit_contract(),
  '{"ok": true, "contract": "biblequest_provider_rate_limit_v2"}'::jsonb,
  'the corrected bounded provider rate-limit contract is ready'
);
select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.provider_rate_limit_windows'::regclass
  ),
  'provider rate-limit windows enable RLS'
);
select ok(
  (
    select relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.provider_rate_limit_windows'::regclass
  ),
  'provider rate-limit windows force RLS'
);
select ok(
  not has_table_privilege(
    'anon', 'public.provider_rate_limit_windows', 'SELECT'
  ),
  'anonymous clients cannot read provider buckets'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.provider_rate_limit_windows', 'SELECT'
  ),
  'authenticated clients cannot read provider buckets'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_provider_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ),
  'anonymous clients cannot claim provider windows'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_provider_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot claim provider windows directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_provider_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ),
  'only the server service role can claim provider windows'
);

set local role service_role;
select is(
  (
    public.claim_provider_rate_limit(
      'ai-shepherd', repeat('a', 64), 2, 60
    )->>'allowed'
  )::boolean,
  true,
  'the first request is allowed'
);
select is(
  (
    public.claim_provider_rate_limit(
      'ai-shepherd', repeat('a', 64), 2, 60
    )->>'allowed'
  )::boolean,
  true,
  'the final request inside the limit is allowed'
);
select is(
  (
    public.claim_provider_rate_limit(
      'ai-shepherd', repeat('a', 64), 2, 60
    )->>'allowed'
  )::boolean,
  false,
  'the shared window rejects excess requests'
);
select ok(
  (
    public.claim_provider_rate_limit(
      'ai-shepherd', repeat('a', 64), 2, 60
    )->>'retry_after'
  )::integer between 1 and 60,
  'the rejection returns a bounded retry interval'
);
select is(
  (
    public.claim_provider_rate_limit(
      'ai-shepherd', repeat('b', 64), 2, 60
    )->>'allowed'
  )::boolean,
  true,
  'a different opaque bucket receives its own window'
);
reset role;
set role postgres;

select throws_ok(
  $sql$
    select public.claim_provider_rate_limit(
      'INVALID SCOPE', repeat('c', 64), 2, 60
    )
  $sql$,
  '22023',
  null,
  'malformed claims fail closed'
);

select * from finish();
rollback;
