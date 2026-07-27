-- Add an append-only operator trail without exposing it to app clients.
create table public.console_audit_logs (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid references auth.users(id) on delete set null,
  operator_email text not null,
  action text not null,
  target_type text,
  target_key text,
  outcome text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint console_audit_email_check check (
    operator_email = pg_catalog.lower(pg_catalog.btrim(operator_email))
    and pg_catalog.length(operator_email) between 3 and 254
    and operator_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  ),
  constraint console_audit_action_check check (
    pg_catalog.length(action) between 3 and 96
    and action ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'
  ),
  constraint console_audit_target_type_check check (
    target_type is null
    or (
      pg_catalog.length(target_type) between 2 and 48
      and target_type ~ '^[a-z][a-z0-9_]*$'
    )
  ),
  constraint console_audit_target_key_check check (
    target_key is null
    or pg_catalog.length(target_key) between 1 and 160
  ),
  constraint console_audit_outcome_check check (
    outcome in ('succeeded', 'denied', 'failed')
  ),
  constraint console_audit_details_check check (
    pg_catalog.jsonb_typeof(details) = 'object'
    and pg_catalog.pg_column_size(details) <= 4096
  )
);

create index console_audit_logs_created_idx
  on public.console_audit_logs (created_at desc);
create index console_audit_logs_operator_idx
  on public.console_audit_logs (operator_user_id, created_at desc);
create index console_audit_logs_action_idx
  on public.console_audit_logs (action, outcome, created_at desc);

alter table public.console_audit_logs enable row level security;
alter table public.console_audit_logs force row level security;

revoke all on table public.console_audit_logs
  from public, anon, authenticated, service_role;
grant select, insert on table public.console_audit_logs to service_role;

-- Append one bounded audit record through the server-only operator boundary.
create or replace function public.append_console_audit_log(
  p_operator_user_id uuid,
  p_operator_email text,
  p_action text,
  p_target_type text default null,
  p_target_key text default null,
  p_outcome text default 'succeeded',
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_id uuid;
begin
  insert into public.console_audit_logs (
    operator_user_id,
    operator_email,
    action,
    target_type,
    target_key,
    outcome,
    details
  )
  values (
    p_operator_user_id,
    pg_catalog.lower(pg_catalog.btrim(p_operator_email)),
    p_action,
    p_target_type,
    p_target_key,
    p_outcome,
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.append_console_audit_log(
  uuid, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.append_console_audit_log(
  uuid, text, text, text, text, text, jsonb
) to service_role;

-- Return privacy-safe product aggregates without exposing member rows.
create or replace function public.console_insights(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  parameters as (
    select
      case when p_days in (7, 30, 90) then p_days else 30 end as days,
      (pg_catalog.now() at time zone 'America/New_York')::date as today,
      (pg_catalog.now() at time zone 'America/New_York')::date -
        (case when p_days in (7, 30, 90) then p_days else 30 end - 1)
          as start_date
  ),
  calendar as (
    select series::date as day
    from parameters,
      pg_catalog.generate_series(
        parameters.start_date,
        parameters.today,
        '1 day'::interval
      ) as series
  ),
  profile_daily as (
    select
      (profiles.created_at at time zone 'America/New_York')::date as day,
      pg_catalog.count(*)::integer as new_accounts,
      pg_catalog.count(*) filter (
        where profiles.onboarding_completed
      )::integer as onboarded_cohort
    from public.profiles, parameters
    where profiles.created_at >= parameters.start_date::timestamptz
    group by 1
  ),
  quest_daily as (
    select
      (quest_completions.completed_at at time zone 'America/New_York')::date
        as day,
      pg_catalog.count(*)::integer as quest_completions,
      pg_catalog.count(distinct quest_completions.user_id)::integer
        as active_questers
    from public.quest_completions, parameters
    where quest_completions.completed_at >= parameters.start_date::timestamptz
    group by 1
  ),
  push_daily as (
    select
      (push_deliveries.created_at at time zone 'America/New_York')::date
        as day,
      pg_catalog.count(*) filter (
        where push_deliveries.status = 'sent'
      )::integer as push_sent,
      pg_catalog.count(*) filter (
        where push_deliveries.status in (
          'transient_failure',
          'permanent_failure'
        )
      )::integer as push_failed,
      pg_catalog.count(*) filter (
        where push_deliveries.status = 'sending'
      )::integer as push_pending
    from public.push_deliveries, parameters
    where push_deliveries.created_at >= parameters.start_date::timestamptz
      and push_deliveries.reminder_kind <> 'test'
    group by 1
  ),
  daily as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'date', calendar.day,
          'new_accounts', coalesce(profile_daily.new_accounts, 0),
          'onboarded_cohort',
            coalesce(profile_daily.onboarded_cohort, 0),
          'quest_completions',
            coalesce(quest_daily.quest_completions, 0),
          'active_questers',
            coalesce(quest_daily.active_questers, 0),
          'push_sent', coalesce(push_daily.push_sent, 0),
          'push_failed', coalesce(push_daily.push_failed, 0),
          'push_pending', coalesce(push_daily.push_pending, 0)
        )
        order by calendar.day
      ),
      '[]'::jsonb
    ) as value
    from calendar
    left join profile_daily on profile_daily.day = calendar.day
    left join quest_daily on quest_daily.day = calendar.day
    left join push_daily on push_daily.day = calendar.day
  ),
  cohort_profiles as (
    select profiles.id, profiles.onboarding_completed
    from public.profiles, parameters
    where profiles.created_at >= parameters.start_date::timestamptz
  ),
  cohort_progress as (
    select
      cohort_profiles.id,
      cohort_profiles.onboarding_completed,
      pg_catalog.count(
        distinct (
          quest_completions.completed_at at time zone 'America/New_York'
        )::date
      )::integer as completion_days
    from cohort_profiles
    left join public.quest_completions
      on quest_completions.user_id = cohort_profiles.id
    group by cohort_profiles.id, cohort_profiles.onboarding_completed
  ),
  funnel as (
    select pg_catalog.jsonb_build_object(
      'accounts_created', pg_catalog.count(*)::integer,
      'onboarding_completed', pg_catalog.count(*) filter (
        where cohort_progress.onboarding_completed
      )::integer,
      'first_quest', pg_catalog.count(*) filter (
        where cohort_progress.completion_days >= 1
      )::integer,
      'repeat_quest', pg_catalog.count(*) filter (
        where cohort_progress.completion_days >= 2
      )::integer
    ) as value
    from cohort_progress
  ),
  top_quest_rows as (
    select
      quest_completions.quest_slug as slug,
      pg_catalog.count(*)::integer as completions
    from public.quest_completions, parameters
    where quest_completions.completed_at >= parameters.start_date::timestamptz
    group by quest_completions.quest_slug
    order by completions desc, slug
    limit 8
  ),
  top_quests as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'slug', top_quest_rows.slug,
          'completions', top_quest_rows.completions
        )
        order by top_quest_rows.completions desc, top_quest_rows.slug
      ),
      '[]'::jsonb
    ) as value
    from top_quest_rows
  ),
  totals as (
    select pg_catalog.jsonb_build_object(
      'accounts', (
        select pg_catalog.count(*)::integer from public.profiles
      ),
      'onboarded_accounts', (
        select pg_catalog.count(*)::integer
        from public.profiles
        where onboarding_completed
      ),
      'quest_completions', (
        select pg_catalog.count(*)::integer
        from public.quest_completions, parameters
        where quest_completions.completed_at >=
          parameters.start_date::timestamptz
      ),
      'active_questers', (
        select pg_catalog.count(distinct quest_completions.user_id)::integer
        from public.quest_completions, parameters
        where quest_completions.completed_at >=
          parameters.start_date::timestamptz
      ),
      'push_sent', (
        select pg_catalog.count(*)::integer
        from public.push_deliveries, parameters
        where push_deliveries.created_at >= parameters.start_date::timestamptz
          and push_deliveries.reminder_kind <> 'test'
          and push_deliveries.status = 'sent'
      ),
      'push_failed', (
        select pg_catalog.count(*)::integer
        from public.push_deliveries, parameters
        where push_deliveries.created_at >= parameters.start_date::timestamptz
          and push_deliveries.reminder_kind <> 'test'
          and push_deliveries.status in (
            'transient_failure',
            'permanent_failure'
          )
      )
    ) as value
  ),
  freshness as (
    select pg_catalog.jsonb_build_object(
      'latest_account', (
        select pg_catalog.max(created_at) from public.profiles
      ),
      'latest_quest', (
        select pg_catalog.max(completed_at) from public.quest_completions
      ),
      'latest_push', (
        select pg_catalog.max(updated_at) from public.push_deliveries
      ),
      'latest_subscription', (
        select pg_catalog.max(updated_at) from public.subscriptions
      ),
      'latest_webhook', (
        select pg_catalog.max(created_at) from public.stripe_webhook_events
      )
    ) as value
  )
  select pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'range_days', parameters.days,
    'daily', daily.value,
    'funnel', funnel.value,
    'top_quests', top_quests.value,
    'totals', totals.value,
    'freshness', freshness.value
  )
  from parameters, daily, funnel, top_quests, totals, freshness;
$$;

revoke all on function public.console_insights(integer)
  from public, anon, authenticated;
grant execute on function public.console_insights(integer) to service_role;
