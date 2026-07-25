-- Mutable account rows use server-enforced timestamps so stale devices cannot
-- overwrite newer profile, preference, prayer, or reflection state.
create or replace function public.upsert_mutable_account_rows(
  p_resource text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  input_count integer;
  applied_count integer := 0;
begin
  if uid is null then
    raise exception 'upsert_mutable_account_rows: not authenticated'
      using errcode = '42501';
  end if;
  if p_resource is null or p_resource not in (
    'profiles',
    'user_settings',
    'notification_preferences',
    'prayers',
    'reflections'
  ) then
    raise exception 'upsert_mutable_account_rows: invalid resource'
      using errcode = '22023';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'upsert_mutable_account_rows: rows must be an array'
      using errcode = '22023';
  end if;

  input_count := pg_catalog.jsonb_array_length(p_rows);
  if input_count > 200 then
    raise exception 'upsert_mutable_account_rows: too many rows'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_rows) as item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception 'upsert_mutable_account_rows: every row must be an object'
      using errcode = '22023';
  end if;

  -- Profiles use auth.uid() as their primary key and accept no caller owner id.
  if p_resource = 'profiles' then
    if input_count > 1 or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_rows) as item(value)
      where exists (
        select 1
        from pg_catalog.jsonb_object_keys(item.value) as key(name)
        where key.name not in (
          'display_name',
          'tradition',
          'primary_goal',
          'calling',
          'daily_rhythm',
          'quest_style',
          'onboarding_completed',
          'created_at',
          'updated_at'
        )
      )
    ) then
      raise exception 'upsert_mutable_account_rows: invalid profile rows'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        display_name text,
        tradition text,
        primary_goal text,
        calling text,
        daily_rhythm text,
        quest_style text,
        onboarding_completed boolean,
        created_at timestamptz,
        updated_at timestamptz
      )
      where row.updated_at is null
        or row.created_at is null
        or nullif(pg_catalog.btrim(row.display_name), '') is null
        or row.onboarding_completed is null
    ) then
      raise exception 'upsert_mutable_account_rows: invalid profile values'
        using errcode = '22023';
    end if;

    with input as (
      select *
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        display_name text,
        tradition text,
        primary_goal text,
        calling text,
        daily_rhythm text,
        quest_style text,
        onboarding_completed boolean,
        created_at timestamptz,
        updated_at timestamptz
      )
    ), validated as (
      select *
      from input
      where updated_at is not null
        and created_at is not null
        and nullif(pg_catalog.btrim(display_name), '') is not null
    ), written as (
      insert into public.profiles as current_row (
        id,
        display_name,
        tradition,
        primary_goal,
        calling,
        daily_rhythm,
        quest_style,
        onboarding_completed,
        created_at,
        updated_at
      )
      select
        uid,
        display_name,
        tradition,
        primary_goal,
        calling,
        daily_rhythm,
        quest_style,
        onboarding_completed,
        created_at,
        updated_at
      from validated
      on conflict (id) do update set
        display_name = excluded.display_name,
        tradition = excluded.tradition,
        primary_goal = excluded.primary_goal,
        calling = excluded.calling,
        daily_rhythm = excluded.daily_rhythm,
        quest_style = excluded.quest_style,
        onboarding_completed = excluded.onboarding_completed,
        updated_at = excluded.updated_at
      where excluded.updated_at >= current_row.updated_at
      returning 1
    )
    select pg_catalog.count(*)::integer into applied_count from written;

  -- Settings accept only the application-owned preference columns.
  elsif p_resource = 'user_settings' then
    if input_count > 1 or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_rows) as item(value)
      where exists (
        select 1
        from pg_catalog.jsonb_object_keys(item.value) as key(name)
        where key.name not in (
          'theme',
          'reduced_motion',
          'text_size',
          'quest_duration_pref',
          'quest_category_pref',
          'language',
          'preferred_bible_translation',
          'analytics_consent',
          'updated_at'
        )
      )
    ) then
      raise exception 'upsert_mutable_account_rows: invalid settings rows'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        theme text,
        reduced_motion boolean,
        text_size text,
        quest_duration_pref integer[],
        quest_category_pref text[],
        language text,
        preferred_bible_translation text,
        analytics_consent boolean,
        updated_at timestamptz
      )
      where row.updated_at is null
        or row.theme is null
        or row.reduced_motion is null
        or row.text_size is null
        or row.quest_duration_pref is null
        or row.quest_category_pref is null
        or row.language is null
        or row.preferred_bible_translation is null
        or row.analytics_consent is null
    ) then
      raise exception 'upsert_mutable_account_rows: invalid settings values'
        using errcode = '22023';
    end if;

    with input as (
      select *
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        theme text,
        reduced_motion boolean,
        text_size text,
        quest_duration_pref integer[],
        quest_category_pref text[],
        language text,
        preferred_bible_translation text,
        analytics_consent boolean,
        updated_at timestamptz
      )
    ), validated as (
      select *
      from input
      where updated_at is not null
        and theme is not null
        and reduced_motion is not null
        and text_size is not null
        and quest_duration_pref is not null
        and quest_category_pref is not null
        and language is not null
        and preferred_bible_translation is not null
        and analytics_consent is not null
    ), written as (
      insert into public.user_settings as current_row (
        user_id,
        theme,
        reduced_motion,
        text_size,
        quest_duration_pref,
        quest_category_pref,
        language,
        preferred_bible_translation,
        analytics_consent,
        updated_at
      )
      select
        uid,
        theme,
        reduced_motion,
        text_size,
        quest_duration_pref,
        quest_category_pref,
        language,
        preferred_bible_translation,
        analytics_consent,
        updated_at
      from validated
      on conflict (user_id) do update set
        theme = excluded.theme,
        reduced_motion = excluded.reduced_motion,
        text_size = excluded.text_size,
        quest_duration_pref = excluded.quest_duration_pref,
        quest_category_pref = excluded.quest_category_pref,
        language = excluded.language,
        preferred_bible_translation = excluded.preferred_bible_translation,
        analytics_consent = excluded.analytics_consent,
        updated_at = excluded.updated_at
      where excluded.updated_at >= current_row.updated_at
      returning 1
    )
    select pg_catalog.count(*)::integer into applied_count from written;

  -- Notification preferences preserve server-only timezone data.
  elsif p_resource = 'notification_preferences' then
    if input_count > 1 or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_rows) as item(value)
      where exists (
        select 1
        from pg_catalog.jsonb_object_keys(item.value) as key(name)
        where key.name not in (
          'daily_verse_enabled',
          'daily_quest_enabled',
          'prayer_reminders_enabled',
          'weekly_recap_enabled',
          'preferred_time',
          'updated_at'
        )
      )
    ) then
      raise exception 'upsert_mutable_account_rows: invalid notification rows'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        daily_verse_enabled boolean,
        daily_quest_enabled boolean,
        prayer_reminders_enabled boolean,
        weekly_recap_enabled boolean,
        preferred_time text,
        updated_at timestamptz
      )
      where row.updated_at is null
        or row.daily_verse_enabled is null
        or row.daily_quest_enabled is null
        or row.prayer_reminders_enabled is null
        or row.weekly_recap_enabled is null
    ) then
      raise exception 'upsert_mutable_account_rows: invalid notification values'
        using errcode = '22023';
    end if;

    with input as (
      select *
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        daily_verse_enabled boolean,
        daily_quest_enabled boolean,
        prayer_reminders_enabled boolean,
        weekly_recap_enabled boolean,
        preferred_time text,
        updated_at timestamptz
      )
    ), validated as (
      select *
      from input
      where updated_at is not null
        and daily_verse_enabled is not null
        and daily_quest_enabled is not null
        and prayer_reminders_enabled is not null
        and weekly_recap_enabled is not null
    ), written as (
      insert into public.notification_preferences as current_row (
        user_id,
        daily_verse_enabled,
        daily_quest_enabled,
        prayer_reminders_enabled,
        weekly_recap_enabled,
        preferred_time,
        updated_at
      )
      select
        uid,
        daily_verse_enabled,
        daily_quest_enabled,
        prayer_reminders_enabled,
        weekly_recap_enabled,
        preferred_time,
        updated_at
      from validated
      on conflict (user_id) do update set
        daily_verse_enabled = excluded.daily_verse_enabled,
        daily_quest_enabled = excluded.daily_quest_enabled,
        prayer_reminders_enabled = excluded.prayer_reminders_enabled,
        weekly_recap_enabled = excluded.weekly_recap_enabled,
        preferred_time = excluded.preferred_time,
        updated_at = excluded.updated_at
      where excluded.updated_at >= current_row.updated_at
      returning 1
    )
    select pg_catalog.count(*)::integer into applied_count from written;

  -- Prayer writes never expose the canonical row in their acknowledgement.
  elsif p_resource = 'prayers' then
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_rows) as item(value)
      where exists (
        select 1
        from pg_catalog.jsonb_object_keys(item.value) as key(name)
        where key.name not in (
          'id',
          'title',
          'body',
          'category',
          'status',
          'answered_at',
          'answer_reflection',
          'archived_at',
          'created_at',
          'updated_at'
        )
      )
    ) then
      raise exception 'upsert_mutable_account_rows: invalid prayer rows'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        id uuid,
        title text,
        body text,
        category text,
        status text,
        answered_at timestamptz,
        answer_reflection text,
        archived_at timestamptz,
        created_at timestamptz,
        updated_at timestamptz
      )
      where row.id is null
        or row.body is null
        or row.category is null
        or row.status is null
        or row.created_at is null
        or row.updated_at is null
    ) then
      raise exception 'upsert_mutable_account_rows: invalid prayer values'
        using errcode = '22023';
    end if;

    with input as (
      select *
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        id uuid,
        title text,
        body text,
        category text,
        status text,
        answered_at timestamptz,
        answer_reflection text,
        archived_at timestamptz,
        created_at timestamptz,
        updated_at timestamptz
      )
    ), validated as (
      select *
      from input
      where id is not null
        and body is not null
        and category is not null
        and status is not null
        and created_at is not null
        and updated_at is not null
    ), written as (
      insert into public.prayers as current_row (
        id,
        user_id,
        title,
        body,
        category,
        status,
        answered_at,
        answer_reflection,
        archived_at,
        created_at,
        updated_at
      )
      select
        id,
        uid,
        title,
        body,
        category,
        status,
        answered_at,
        answer_reflection,
        archived_at,
        created_at,
        updated_at
      from validated
      on conflict (id) do update set
        title = excluded.title,
        body = excluded.body,
        category = excluded.category,
        status = excluded.status,
        answered_at = excluded.answered_at,
        answer_reflection = excluded.answer_reflection,
        archived_at = excluded.archived_at,
        updated_at = excluded.updated_at
      where current_row.user_id = uid
        and excluded.updated_at >= current_row.updated_at
      returning 1
    )
    select pg_catalog.count(*)::integer into applied_count from written;

  -- Reflection writes use the same last-write timestamp guard as prayers.
  elsif p_resource = 'reflections' then
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_rows) as item(value)
      where exists (
        select 1
        from pg_catalog.jsonb_object_keys(item.value) as key(name)
        where key.name not in (
          'id',
          'prompt',
          'body',
          'mood',
          'related_quest_slug',
          'related_verse_reference',
          'archived_at',
          'created_at',
          'updated_at'
        )
      )
    ) then
      raise exception 'upsert_mutable_account_rows: invalid reflection rows'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        id uuid,
        prompt text,
        body text,
        mood text,
        related_quest_slug text,
        related_verse_reference text,
        archived_at timestamptz,
        created_at timestamptz,
        updated_at timestamptz
      )
      where row.id is null
        or row.body is null
        or row.created_at is null
        or row.updated_at is null
    ) then
      raise exception 'upsert_mutable_account_rows: invalid reflection values'
        using errcode = '22023';
    end if;

    with input as (
      select *
      from pg_catalog.jsonb_to_recordset(p_rows) as row(
        id uuid,
        prompt text,
        body text,
        mood text,
        related_quest_slug text,
        related_verse_reference text,
        archived_at timestamptz,
        created_at timestamptz,
        updated_at timestamptz
      )
    ), validated as (
      select *
      from input
      where id is not null
        and body is not null
        and created_at is not null
        and updated_at is not null
    ), written as (
      insert into public.reflections as current_row (
        id,
        user_id,
        prompt,
        body,
        mood,
        related_quest_slug,
        related_verse_reference,
        archived_at,
        created_at,
        updated_at
      )
      select
        id,
        uid,
        prompt,
        body,
        mood,
        related_quest_slug,
        related_verse_reference,
        archived_at,
        created_at,
        updated_at
      from validated
      on conflict (id) do update set
        prompt = excluded.prompt,
        body = excluded.body,
        mood = excluded.mood,
        related_quest_slug = excluded.related_quest_slug,
        related_verse_reference = excluded.related_verse_reference,
        archived_at = excluded.archived_at,
        updated_at = excluded.updated_at
      where current_row.user_id = uid
        and excluded.updated_at >= current_row.updated_at
      returning 1
    )
    select pg_catalog.count(*)::integer into applied_count from written;
  end if;

  -- The response is deliberately bounded and contains no user row content.
  return pg_catalog.jsonb_build_object(
    'applied', applied_count,
    'stale', input_count - applied_count
  );
end;
$function$;

-- Only signed-in application clients may invoke the guarded write surface.
revoke execute on function public.upsert_mutable_account_rows(text, jsonb)
  from public, anon;
grant execute on function public.upsert_mutable_account_rows(text, jsonb)
  to authenticated;
