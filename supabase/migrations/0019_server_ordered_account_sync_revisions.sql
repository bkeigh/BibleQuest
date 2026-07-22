-- Replace client-clock conflict authority with server-owned row revisions.
alter table public.profiles
  add column if not exists sync_revision bigint not null default 1
    check (sync_revision > 0);
alter table public.user_settings
  add column if not exists sync_revision bigint not null default 1
    check (sync_revision > 0);
alter table public.notification_preferences
  add column if not exists sync_revision bigint not null default 1
    check (sync_revision > 0);
alter table public.prayers
  add column if not exists sync_revision bigint not null default 1
    check (sync_revision > 0);
alter table public.reflections
  add column if not exists sync_revision bigint not null default 1
    check (sync_revision > 0);
alter table public.user_quests
  add column if not exists sync_revision bigint not null default 1
    check (sync_revision > 0);
alter table public.reading_progress
  add column if not exists sync_revision bigint not null default 1
    check (sync_revision > 0);
alter table public.verse_bookmarks
  add column if not exists sync_revision bigint not null default 1
    check (sync_revision > 0);
alter table public.user_recent_verses
  add column if not exists sync_revision bigint not null default 1
    check (sync_revision > 0);

-- Rank recent passages by a database-owned observation time, never by a
-- device-supplied clock.
alter table public.user_recent_verses
  add column if not exists server_seen_at timestamptz not null default now();

-- The database, not a caller payload, assigns every stored revision.
create or replace function public.advance_account_sync_revision()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.sync_revision := 1;
  else
    new.sync_revision := old.sync_revision + 1;
  end if;
  if tg_table_schema = 'public'
     and tg_table_name = 'user_recent_verses' then
    new.server_seen_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$function$;

revoke execute on function public.advance_account_sync_revision()
  from public, anon, authenticated, service_role;

-- Install the same revision authority on every conflict-bearing sync table.
drop trigger if exists advance_account_sync_revision on public.profiles;
create trigger advance_account_sync_revision
  before insert or update on public.profiles
  for each row execute function public.advance_account_sync_revision();
drop trigger if exists advance_account_sync_revision on public.user_settings;
create trigger advance_account_sync_revision
  before insert or update on public.user_settings
  for each row execute function public.advance_account_sync_revision();
drop trigger if exists advance_account_sync_revision
  on public.notification_preferences;
create trigger advance_account_sync_revision
  before insert or update on public.notification_preferences
  for each row execute function public.advance_account_sync_revision();
drop trigger if exists advance_account_sync_revision on public.prayers;
create trigger advance_account_sync_revision
  before insert or update on public.prayers
  for each row execute function public.advance_account_sync_revision();
drop trigger if exists advance_account_sync_revision on public.reflections;
create trigger advance_account_sync_revision
  before insert or update on public.reflections
  for each row execute function public.advance_account_sync_revision();
drop trigger if exists advance_account_sync_revision on public.user_quests;
create trigger advance_account_sync_revision
  before insert or update on public.user_quests
  for each row execute function public.advance_account_sync_revision();
drop trigger if exists advance_account_sync_revision on public.reading_progress;
create trigger advance_account_sync_revision
  before insert or update on public.reading_progress
  for each row execute function public.advance_account_sync_revision();
drop trigger if exists advance_account_sync_revision on public.verse_bookmarks;
create trigger advance_account_sync_revision
  before insert or update on public.verse_bookmarks
  for each row execute function public.advance_account_sync_revision();
drop trigger if exists advance_account_sync_revision
  on public.user_recent_verses;
create trigger advance_account_sync_revision
  before insert or update on public.user_recent_verses
  for each row execute function public.advance_account_sync_revision();

-- A client timestamp can remain display metadata but can no longer suppress an
-- otherwise valid recent-verse revision write.
drop trigger if exists keep_newest_recent_verse
  on public.user_recent_verses;

-- Browser mutations now have one audited path with identity, generation, and
-- per-row compare-and-swap checks. Service operations retain their privileges.
revoke insert, update, delete on table
  public.profiles,
  public.user_settings,
  public.notification_preferences,
  public.prayers,
  public.reflections,
  public.user_quests,
  public.reading_progress,
  public.verse_bookmarks,
  public.user_recent_verses
from authenticated;

-- Write a bounded batch through independent, attributable row revisions.
create or replace function public.upsert_mutable_account_rows(
  p_expected_user_id uuid,
  p_expected_generation bigint,
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
  live_generation bigint;
  envelope jsonb;
  row_value jsonb;
  expected_revision bigint;
  resulting_revision bigint;
  results jsonb := '[]'::jsonb;
  resource_key jsonb;
  write_status text;
  did_write boolean;
  profile_row public.profiles%rowtype;
  settings_row public.user_settings%rowtype;
  notification_row public.notification_preferences%rowtype;
  prayer_row public.prayers%rowtype;
  reflection_row public.reflections%rowtype;
  quest_row public.user_quests%rowtype;
  reading_row public.reading_progress%rowtype;
  bookmark_row public.verse_bookmarks%rowtype;
  recent_row public.user_recent_verses%rowtype;
begin
  live_generation := public.assert_user_sync_context(
    p_expected_user_id,
    p_expected_generation,
    false
  );
  perform pg_catalog.set_config(
    'biblequest.sync_expected_user', p_expected_user_id::text, true
  );
  perform pg_catalog.set_config(
    'biblequest.sync_generation', live_generation::text, true
  );

  if p_resource is null or p_resource not in (
    'profiles',
    'user_settings',
    'notification_preferences',
    'prayers',
    'reflections',
    'user_quests',
    'reading_progress',
    'verse_bookmarks',
    'user_recent_verses'
  ) then
    raise exception 'upsert_mutable_account_rows: invalid resource'
      using errcode = '22023';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'upsert_mutable_account_rows: rows must be an array'
      using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_rows) > 200 then
    raise exception 'upsert_mutable_account_rows: too many rows'
      using errcode = '22023';
  end if;
  if p_resource in (
    'profiles', 'user_settings', 'notification_preferences', 'reading_progress'
  ) and pg_catalog.jsonb_array_length(p_rows) > 1 then
    raise exception 'upsert_mutable_account_rows: too many singleton rows'
      using errcode = '22023';
  end if;

  for envelope in
    select item.value
    from pg_catalog.jsonb_array_elements(p_rows) as item(value)
  loop
    if pg_catalog.jsonb_typeof(envelope) <> 'object'
       or not (envelope ? 'expected_revision')
       or not (envelope ? 'row')
       or exists (
         select 1
         from pg_catalog.jsonb_object_keys(envelope) as key(name)
         where key.name not in ('expected_revision', 'row')
       )
       or pg_catalog.jsonb_typeof(envelope->'expected_revision') <> 'number'
       or (envelope->>'expected_revision') !~ '^(0|[1-9][0-9]*)$'
       or pg_catalog.jsonb_typeof(envelope->'row') <> 'object' then
      raise exception 'upsert_mutable_account_rows: invalid revision envelope'
        using errcode = '22023';
    end if;

    expected_revision := (envelope->>'expected_revision')::bigint;
    row_value := envelope->'row';
    resulting_revision := null;
    resource_key := null;
    did_write := false;

    if p_resource = 'profiles' then
      if exists (
        select 1 from pg_catalog.jsonb_object_keys(row_value) as key(name)
        where key.name not in (
          'display_name', 'tradition', 'primary_goal', 'calling',
          'daily_rhythm', 'quest_style', 'onboarding_completed',
          'created_at', 'updated_at'
        )
      ) then
        raise exception 'upsert_mutable_account_rows: invalid profile row'
          using errcode = '22023';
      end if;
      profile_row := pg_catalog.jsonb_populate_record(
        null::public.profiles, row_value
      );
      if nullif(pg_catalog.btrim(profile_row.display_name), '') is null
         or profile_row.onboarding_completed is null
         or profile_row.created_at is null
         or profile_row.updated_at is null then
        raise exception 'upsert_mutable_account_rows: invalid profile values'
          using errcode = '22023';
      end if;
      resource_key := pg_catalog.jsonb_build_object('id', uid);
      if expected_revision = 0 then
        insert into public.profiles (
          id, display_name, tradition, primary_goal, calling, daily_rhythm,
          quest_style, onboarding_completed, created_at, updated_at
        ) values (
          uid, profile_row.display_name, profile_row.tradition,
          profile_row.primary_goal, profile_row.calling,
          profile_row.daily_rhythm, profile_row.quest_style,
          profile_row.onboarding_completed, profile_row.created_at,
          profile_row.updated_at
        ) on conflict (id) do nothing
        returning sync_revision into resulting_revision;
      else
        update public.profiles set
          display_name = profile_row.display_name,
          tradition = profile_row.tradition,
          primary_goal = profile_row.primary_goal,
          calling = profile_row.calling,
          daily_rhythm = profile_row.daily_rhythm,
          quest_style = profile_row.quest_style,
          onboarding_completed = profile_row.onboarding_completed,
          updated_at = profile_row.updated_at
        where id = uid and sync_revision = expected_revision
        returning sync_revision into resulting_revision;
      end if;
      did_write := resulting_revision is not null;
      if resulting_revision is null then
        select sync_revision into resulting_revision
        from public.profiles where id = uid;
      end if;

    elsif p_resource = 'user_settings' then
      if exists (
        select 1 from pg_catalog.jsonb_object_keys(row_value) as key(name)
        where key.name not in (
          'theme', 'reduced_motion', 'text_size', 'quest_duration_pref',
          'quest_category_pref', 'language', 'preferred_bible_translation',
          'analytics_consent', 'updated_at'
        )
      ) then
        raise exception 'upsert_mutable_account_rows: invalid settings row'
          using errcode = '22023';
      end if;
      settings_row := pg_catalog.jsonb_populate_record(
        null::public.user_settings, row_value
      );
      if settings_row.theme is null or settings_row.reduced_motion is null
         or settings_row.text_size is null
         or settings_row.quest_duration_pref is null
         or settings_row.quest_category_pref is null
         or settings_row.language is null
         or settings_row.preferred_bible_translation is null
         or settings_row.analytics_consent is null
         or settings_row.updated_at is null then
        raise exception 'upsert_mutable_account_rows: invalid settings values'
          using errcode = '22023';
      end if;
      resource_key := pg_catalog.jsonb_build_object('user_id', uid);
      if expected_revision = 0 then
        insert into public.user_settings (
          user_id, theme, reduced_motion, text_size, quest_duration_pref,
          quest_category_pref, language, preferred_bible_translation,
          analytics_consent, updated_at
        ) values (
          uid, settings_row.theme, settings_row.reduced_motion,
          settings_row.text_size, settings_row.quest_duration_pref,
          settings_row.quest_category_pref, settings_row.language,
          settings_row.preferred_bible_translation,
          settings_row.analytics_consent, settings_row.updated_at
        ) on conflict (user_id) do nothing
        returning sync_revision into resulting_revision;
      else
        update public.user_settings set
          theme = settings_row.theme,
          reduced_motion = settings_row.reduced_motion,
          text_size = settings_row.text_size,
          quest_duration_pref = settings_row.quest_duration_pref,
          quest_category_pref = settings_row.quest_category_pref,
          language = settings_row.language,
          preferred_bible_translation = settings_row.preferred_bible_translation,
          analytics_consent = settings_row.analytics_consent,
          updated_at = settings_row.updated_at
        where user_id = uid and sync_revision = expected_revision
        returning sync_revision into resulting_revision;
      end if;
      did_write := resulting_revision is not null;
      if resulting_revision is null then
        select sync_revision into resulting_revision
        from public.user_settings where user_id = uid;
      end if;

    elsif p_resource = 'notification_preferences' then
      if exists (
        select 1 from pg_catalog.jsonb_object_keys(row_value) as key(name)
        where key.name not in (
          'daily_verse_enabled', 'daily_quest_enabled',
          'prayer_reminders_enabled', 'weekly_recap_enabled',
          'preferred_time', 'updated_at'
        )
      ) then
        raise exception 'upsert_mutable_account_rows: invalid notification row'
          using errcode = '22023';
      end if;
      notification_row := pg_catalog.jsonb_populate_record(
        null::public.notification_preferences, row_value
      );
      if notification_row.daily_verse_enabled is null
         or notification_row.daily_quest_enabled is null
         or notification_row.prayer_reminders_enabled is null
         or notification_row.weekly_recap_enabled is null
         or notification_row.updated_at is null then
        raise exception 'upsert_mutable_account_rows: invalid notification values'
          using errcode = '22023';
      end if;
      resource_key := pg_catalog.jsonb_build_object('user_id', uid);
      if expected_revision = 0 then
        insert into public.notification_preferences (
          user_id, daily_verse_enabled, daily_quest_enabled,
          prayer_reminders_enabled, weekly_recap_enabled, preferred_time,
          updated_at
        ) values (
          uid, notification_row.daily_verse_enabled,
          notification_row.daily_quest_enabled,
          notification_row.prayer_reminders_enabled,
          notification_row.weekly_recap_enabled,
          notification_row.preferred_time, notification_row.updated_at
        ) on conflict (user_id) do nothing
        returning sync_revision into resulting_revision;
      else
        update public.notification_preferences set
          daily_verse_enabled = notification_row.daily_verse_enabled,
          daily_quest_enabled = notification_row.daily_quest_enabled,
          prayer_reminders_enabled = notification_row.prayer_reminders_enabled,
          weekly_recap_enabled = notification_row.weekly_recap_enabled,
          preferred_time = notification_row.preferred_time,
          updated_at = notification_row.updated_at
        where user_id = uid and sync_revision = expected_revision
        returning sync_revision into resulting_revision;
      end if;
      did_write := resulting_revision is not null;
      if resulting_revision is null then
        select sync_revision into resulting_revision
        from public.notification_preferences where user_id = uid;
      end if;

    elsif p_resource = 'prayers' then
      if exists (
        select 1 from pg_catalog.jsonb_object_keys(row_value) as key(name)
        where key.name not in (
          'id', 'title', 'body', 'category', 'status', 'answered_at',
          'answer_reflection', 'archived_at', 'created_at', 'updated_at'
        )
      ) then
        raise exception 'upsert_mutable_account_rows: invalid prayer row'
          using errcode = '22023';
      end if;
      prayer_row := pg_catalog.jsonb_populate_record(
        null::public.prayers, row_value
      );
      if prayer_row.id is null or prayer_row.body is null
         or prayer_row.category is null or prayer_row.status is null
         or prayer_row.created_at is null or prayer_row.updated_at is null then
        raise exception 'upsert_mutable_account_rows: invalid prayer values'
          using errcode = '22023';
      end if;
      resource_key := pg_catalog.jsonb_build_object('id', prayer_row.id);
      if expected_revision = 0 then
        insert into public.prayers (
          id, user_id, title, body, category, status, answered_at,
          answer_reflection, archived_at, created_at, updated_at
        ) values (
          prayer_row.id, uid, prayer_row.title, prayer_row.body,
          prayer_row.category, prayer_row.status, prayer_row.answered_at,
          prayer_row.answer_reflection, prayer_row.archived_at,
          prayer_row.created_at, prayer_row.updated_at
        ) on conflict (id) do nothing
        returning sync_revision into resulting_revision;
      else
        update public.prayers set
          title = prayer_row.title,
          body = prayer_row.body,
          category = prayer_row.category,
          status = prayer_row.status,
          answered_at = prayer_row.answered_at,
          answer_reflection = prayer_row.answer_reflection,
          archived_at = prayer_row.archived_at,
          updated_at = prayer_row.updated_at
        where id = prayer_row.id and user_id = uid
          and sync_revision = expected_revision
        returning sync_revision into resulting_revision;
      end if;
      did_write := resulting_revision is not null;
      if resulting_revision is null then
        select sync_revision into resulting_revision
        from public.prayers where id = prayer_row.id and user_id = uid;
      end if;

    elsif p_resource = 'reflections' then
      if exists (
        select 1 from pg_catalog.jsonb_object_keys(row_value) as key(name)
        where key.name not in (
          'id', 'prompt', 'body', 'mood', 'related_quest_slug',
          'related_verse_reference', 'archived_at', 'created_at', 'updated_at'
        )
      ) then
        raise exception 'upsert_mutable_account_rows: invalid reflection row'
          using errcode = '22023';
      end if;
      reflection_row := pg_catalog.jsonb_populate_record(
        null::public.reflections, row_value
      );
      if reflection_row.id is null or reflection_row.body is null
         or reflection_row.created_at is null
         or reflection_row.updated_at is null then
        raise exception 'upsert_mutable_account_rows: invalid reflection values'
          using errcode = '22023';
      end if;
      resource_key := pg_catalog.jsonb_build_object('id', reflection_row.id);
      if expected_revision = 0 then
        insert into public.reflections (
          id, user_id, prompt, body, mood, related_quest_slug,
          related_verse_reference, archived_at, created_at, updated_at
        ) values (
          reflection_row.id, uid, reflection_row.prompt, reflection_row.body,
          reflection_row.mood, reflection_row.related_quest_slug,
          reflection_row.related_verse_reference, reflection_row.archived_at,
          reflection_row.created_at, reflection_row.updated_at
        ) on conflict (id) do nothing
        returning sync_revision into resulting_revision;
      else
        update public.reflections set
          prompt = reflection_row.prompt,
          body = reflection_row.body,
          mood = reflection_row.mood,
          related_quest_slug = reflection_row.related_quest_slug,
          related_verse_reference = reflection_row.related_verse_reference,
          archived_at = reflection_row.archived_at,
          updated_at = reflection_row.updated_at
        where id = reflection_row.id and user_id = uid
          and sync_revision = expected_revision
        returning sync_revision into resulting_revision;
      end if;
      did_write := resulting_revision is not null;
      if resulting_revision is null then
        select sync_revision into resulting_revision
        from public.reflections where id = reflection_row.id and user_id = uid;
      end if;

    elsif p_resource = 'user_quests' then
      if exists (
        select 1 from pg_catalog.jsonb_object_keys(row_value) as key(name)
        where key.name not in (
          'quest_slug', 'status', 'steps_done', 'times_completed', 'added_at',
          'started_at', 'paused_at', 'completed_at', 'archived_at',
          'last_activity_at'
        )
      ) then
        raise exception 'upsert_mutable_account_rows: invalid user quest row'
          using errcode = '22023';
      end if;
      quest_row := pg_catalog.jsonb_populate_record(
        null::public.user_quests, row_value
      );
      if nullif(pg_catalog.btrim(quest_row.quest_slug), '') is null
         or quest_row.status is null or quest_row.steps_done is null
         or quest_row.times_completed is null or quest_row.times_completed < 0
         or quest_row.added_at is null
         or quest_row.last_activity_at is null then
        raise exception 'upsert_mutable_account_rows: invalid user quest values'
          using errcode = '22023';
      end if;
      resource_key := pg_catalog.jsonb_build_object(
        'quest_slug', quest_row.quest_slug
      );
      if expected_revision = 0 then
        insert into public.user_quests (
          user_id, quest_slug, status, steps_done, times_completed, added_at,
          started_at, paused_at, completed_at, archived_at, last_activity_at
        ) values (
          uid, quest_row.quest_slug, quest_row.status, quest_row.steps_done,
          quest_row.times_completed, quest_row.added_at, quest_row.started_at,
          quest_row.paused_at, quest_row.completed_at, quest_row.archived_at,
          quest_row.last_activity_at
        ) on conflict (user_id, quest_slug) do nothing
        returning sync_revision into resulting_revision;
      else
        update public.user_quests set
          status = quest_row.status,
          steps_done = quest_row.steps_done,
          times_completed = quest_row.times_completed,
          added_at = quest_row.added_at,
          started_at = quest_row.started_at,
          paused_at = quest_row.paused_at,
          completed_at = quest_row.completed_at,
          archived_at = quest_row.archived_at,
          last_activity_at = quest_row.last_activity_at
        where user_id = uid and quest_slug = quest_row.quest_slug
          and sync_revision = expected_revision
        returning sync_revision into resulting_revision;
      end if;
      did_write := resulting_revision is not null;
      if resulting_revision is null then
        select sync_revision into resulting_revision
        from public.user_quests
        where user_id = uid and quest_slug = quest_row.quest_slug;
      end if;

    elsif p_resource = 'reading_progress' then
      if exists (
        select 1 from pg_catalog.jsonb_object_keys(row_value) as key(name)
        where key.name not in ('book_slug', 'book_name', 'chapter', 'updated_at')
      ) then
        raise exception 'upsert_mutable_account_rows: invalid reading row'
          using errcode = '22023';
      end if;
      reading_row := pg_catalog.jsonb_populate_record(
        null::public.reading_progress, row_value
      );
      if nullif(pg_catalog.btrim(reading_row.book_slug), '') is null
         or nullif(pg_catalog.btrim(reading_row.book_name), '') is null
         or reading_row.chapter is null or reading_row.chapter < 1
         or reading_row.updated_at is null then
        raise exception 'upsert_mutable_account_rows: invalid reading values'
          using errcode = '22023';
      end if;
      resource_key := pg_catalog.jsonb_build_object('user_id', uid);
      if expected_revision = 0 then
        insert into public.reading_progress (
          user_id, book_slug, book_name, chapter, updated_at
        ) values (
          uid, reading_row.book_slug, reading_row.book_name,
          reading_row.chapter, reading_row.updated_at
        ) on conflict (user_id) do nothing
        returning sync_revision into resulting_revision;
      else
        update public.reading_progress set
          book_slug = reading_row.book_slug,
          book_name = reading_row.book_name,
          chapter = reading_row.chapter,
          updated_at = reading_row.updated_at
        where user_id = uid and sync_revision = expected_revision
        returning sync_revision into resulting_revision;
      end if;
      did_write := resulting_revision is not null;
      if resulting_revision is null then
        select sync_revision into resulting_revision
        from public.reading_progress where user_id = uid;
      end if;

    elsif p_resource = 'verse_bookmarks' then
      if exists (
        select 1 from pg_catalog.jsonb_object_keys(row_value) as key(name)
        where key.name not in (
          'id', 'book_slug', 'book_name', 'chapter', 'verse', 'text',
          'translation_key', 'note', 'created_at'
        )
      ) then
        raise exception 'upsert_mutable_account_rows: invalid bookmark row'
          using errcode = '22023';
      end if;
      bookmark_row := pg_catalog.jsonb_populate_record(
        null::public.verse_bookmarks, row_value
      );
      if bookmark_row.id is null
         or nullif(pg_catalog.btrim(bookmark_row.book_slug), '') is null
         or nullif(pg_catalog.btrim(bookmark_row.book_name), '') is null
         or bookmark_row.chapter is null or bookmark_row.chapter < 1
         or bookmark_row.verse is null or bookmark_row.verse < 1
         or bookmark_row.text is null
         or nullif(pg_catalog.btrim(bookmark_row.translation_key), '') is null
         or bookmark_row.created_at is null then
        raise exception 'upsert_mutable_account_rows: invalid bookmark values'
          using errcode = '22023';
      end if;
      resource_key := pg_catalog.jsonb_build_object(
        'book_slug', bookmark_row.book_slug,
        'chapter', bookmark_row.chapter,
        'verse', bookmark_row.verse,
        'translation_key', bookmark_row.translation_key
      );
      if expected_revision = 0 then
        insert into public.verse_bookmarks (
          id, user_id, book_slug, book_name, chapter, verse, text,
          translation_key, note, created_at
        ) values (
          bookmark_row.id, uid, bookmark_row.book_slug, bookmark_row.book_name,
          bookmark_row.chapter, bookmark_row.verse, bookmark_row.text,
          bookmark_row.translation_key, bookmark_row.note,
          bookmark_row.created_at
        ) on conflict (
          user_id, book_slug, chapter, verse, translation_key
        ) do nothing
        returning sync_revision into resulting_revision;
      else
        update public.verse_bookmarks set
          book_name = bookmark_row.book_name,
          text = bookmark_row.text,
          note = bookmark_row.note
        where user_id = uid
          and book_slug = bookmark_row.book_slug
          and chapter = bookmark_row.chapter
          and verse = bookmark_row.verse
          and translation_key = bookmark_row.translation_key
          and sync_revision = expected_revision
        returning sync_revision into resulting_revision;
      end if;
      did_write := resulting_revision is not null;
      if resulting_revision is null then
        select sync_revision into resulting_revision
        from public.verse_bookmarks
        where user_id = uid
          and book_slug = bookmark_row.book_slug
          and chapter = bookmark_row.chapter
          and verse = bookmark_row.verse
          and translation_key = bookmark_row.translation_key;
      end if;

    elsif p_resource = 'user_recent_verses' then
      if exists (
        select 1 from pg_catalog.jsonb_object_keys(row_value) as key(name)
        where key.name not in (
          'book_slug', 'book_name', 'chapter', 'verse_start', 'verse_end',
          'reference', 'text', 'viewed_at'
        )
      ) then
        raise exception 'upsert_mutable_account_rows: invalid recent verse row'
          using errcode = '22023';
      end if;
      recent_row := pg_catalog.jsonb_populate_record(
        null::public.user_recent_verses, row_value
      );
      if nullif(pg_catalog.btrim(recent_row.book_slug), '') is null
         or nullif(pg_catalog.btrim(recent_row.book_name), '') is null
         or recent_row.chapter is null or recent_row.chapter < 1
         or recent_row.verse_start is null or recent_row.verse_start < 1
         or recent_row.verse_end is null
         or recent_row.verse_end < recent_row.verse_start
         or recent_row.reference is null or recent_row.text is null
         or recent_row.viewed_at is null then
        raise exception 'upsert_mutable_account_rows: invalid recent verse values'
          using errcode = '22023';
      end if;
      resource_key := pg_catalog.jsonb_build_object(
        'book_slug', recent_row.book_slug,
        'chapter', recent_row.chapter,
        'verse_start', recent_row.verse_start,
        'verse_end', recent_row.verse_end
      );
      if expected_revision = 0 then
        insert into public.user_recent_verses (
          user_id, book_slug, book_name, chapter, verse_start, verse_end,
          reference, text, viewed_at
        ) values (
          uid, recent_row.book_slug, recent_row.book_name, recent_row.chapter,
          recent_row.verse_start, recent_row.verse_end, recent_row.reference,
          recent_row.text, recent_row.viewed_at
        ) on conflict (
          user_id, book_slug, chapter, verse_start, verse_end
        ) do nothing
        returning sync_revision into resulting_revision;
      else
        update public.user_recent_verses set
          book_name = recent_row.book_name,
          reference = recent_row.reference,
          text = recent_row.text,
          viewed_at = recent_row.viewed_at
        where user_id = uid
          and book_slug = recent_row.book_slug
          and chapter = recent_row.chapter
          and verse_start = recent_row.verse_start
          and verse_end = recent_row.verse_end
          and sync_revision = expected_revision
        returning sync_revision into resulting_revision;
      end if;
      did_write := resulting_revision is not null;
      if resulting_revision is null then
        select sync_revision into resulting_revision
        from public.user_recent_verses
        where user_id = uid
          and book_slug = recent_row.book_slug
          and chapter = recent_row.chapter
          and verse_start = recent_row.verse_start
          and verse_end = recent_row.verse_end;
      end if;
    end if;

    if resulting_revision is null then
      resulting_revision := 0;
      write_status := 'conflict';
    elsif did_write then
      write_status := 'applied';
    else
      write_status := 'conflict';
    end if;

    results := results || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'key', resource_key,
        'status', write_status,
        'revision', resulting_revision
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'generation', live_generation,
    'results', results
  );
exception
  when invalid_text_representation
    or numeric_value_out_of_range
    or datatype_mismatch
    or not_null_violation
    or check_violation then
    raise exception 'upsert_mutable_account_rows: invalid row values'
      using errcode = '22023';
end;
$function$;

revoke execute on function public.upsert_mutable_account_rows(
  uuid, bigint, text, jsonb
) from public, anon;
grant execute on function public.upsert_mutable_account_rows(
  uuid, bigint, text, jsonb
) to authenticated;

-- Publish one content-free posture for the server-revision v4 boundary.
create or replace function public.account_sync_contract()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with sync_table as (
  select
    relation.relrowsecurity
    and pg_catalog.has_column_privilege(
      'authenticated', relation.oid, 'generation', 'SELECT'
    )
    and pg_catalog.has_column_privilege(
      'authenticated', relation.oid, 'updated_at', 'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated', relation.oid, 'user_id', 'SELECT'
    )
    and not pg_catalog.has_column_privilege(
      'authenticated', relation.oid, 'request_history', 'SELECT'
    )
    and not pg_catalog.has_table_privilege('anon', relation.oid, 'SELECT')
    and exists (
      select 1 from pg_catalog.pg_policies as policy
      where policy.schemaname = 'public'
        and policy.tablename = 'user_sync_state'
        and policy.cmd = 'SELECT'
        and policy.roles = array['authenticated']::name[]
        and policy.qual = '(auth.uid() = user_id)'
    ) as ok
  from pg_catalog.pg_class as relation
  where relation.oid = pg_catalog.to_regclass('public.user_sync_state')
), revision_tables(table_name) as (
  values
    ('profiles'), ('user_settings'), ('notification_preferences'),
    ('prayers'), ('reflections'), ('user_quests'), ('reading_progress'),
    ('verse_bookmarks'), ('user_recent_verses')
), revision_columns as (
  select pg_catalog.count(*) = 9
    and pg_catalog.bool_and(attribute.attnotnull)
    and pg_catalog.bool_and(
      pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) = '1'
    ) as ok
  from revision_tables as expected
  join pg_catalog.pg_class as relation on relation.relname = expected.table_name
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace and namespace.nspname = 'public'
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = relation.oid
   and attribute.attname = 'sync_revision'
   and not attribute.attisdropped
  join pg_catalog.pg_attrdef as default_value
    on default_value.adrelid = relation.oid
   and default_value.adnum = attribute.attnum
), revision_triggers as (
  select pg_catalog.count(*) = 9 as ok
  from revision_tables as expected
  join pg_catalog.pg_class as relation on relation.relname = expected.table_name
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace and namespace.nspname = 'public'
  join pg_catalog.pg_trigger as trigger on trigger.tgrelid = relation.oid
  join pg_catalog.pg_proc as procedure on procedure.oid = trigger.tgfoid
  where trigger.tgname = 'advance_account_sync_revision'
    and not trigger.tgisinternal
    and trigger.tgenabled <> 'D'
    and procedure.proname = 'advance_account_sync_revision'
), recent_verse_order as (
  select attribute.attnotnull
    and pg_catalog.pg_get_expr(
      default_value.adbin, default_value.adrelid
    ) = 'now()' as ok
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace and namespace.nspname = 'public'
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = relation.oid
   and attribute.attname = 'server_seen_at'
   and not attribute.attisdropped
  join pg_catalog.pg_attrdef as default_value
    on default_value.adrelid = relation.oid
   and default_value.adnum = attribute.attnum
  where relation.relname = 'user_recent_verses'
), mutation_boundary as (
  select pg_catalog.bool_and(
      not pg_catalog.has_table_privilege(
        'authenticated', pg_catalog.format('public.%I', table_name), 'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', pg_catalog.format('public.%I', table_name), 'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', pg_catalog.format('public.%I', table_name), 'DELETE'
      )
    ) and not exists (
      select 1 from information_schema.column_privileges as privilege
      where privilege.table_schema = 'public'
        and privilege.table_name in (
          'profiles', 'user_settings', 'notification_preferences', 'prayers',
          'reflections', 'user_quests', 'reading_progress', 'verse_bookmarks',
          'user_recent_verses'
        )
        and privilege.grantee = 'authenticated'
        and privilege.privilege_type in ('INSERT', 'UPDATE')
    ) as ok
  from revision_tables
), wrappers(signature) as (
  values
    ('public.account_sync_generation(uuid)'),
    ('public.replace_user_daily_quests(uuid,bigint,date,bigint,uuid,jsonb)'),
    ('public.upsert_mutable_account_rows(uuid,bigint,text,jsonb)'),
    ('public.delete_user_sync_rows(uuid,bigint,uuid,jsonb)'),
    ('public.purge_user_data(uuid,bigint,uuid)')
), hardened_wrappers as (
  select pg_catalog.count(*) = 5 as ok
  from wrappers
  join pg_catalog.pg_proc as procedure
    on procedure.oid = pg_catalog.to_regprocedure(wrappers.signature)
  where procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
), private_invokers(signature) as (
  values
    ('public.replace_user_daily_quests_internal(date,bigint,uuid,jsonb)'),
    ('public.upsert_mutable_account_rows_internal(text,jsonb)'),
    ('public.purge_user_data_internal()'),
    ('public.assert_user_sync_context(uuid,bigint,boolean)')
), hardened_private_invokers as (
  select pg_catalog.count(*) = 4 as ok
  from private_invokers
  join pg_catalog.pg_proc as procedure
    on procedure.oid = pg_catalog.to_regprocedure(private_invokers.signature)
  where not procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and not pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege(
      'service_role', procedure.oid, 'EXECUTE'
    )
), private_definers(signature) as (
  values
    ('public.enforce_user_sync_generation()'),
    ('public.handle_new_user()')
), hardened_private_definers as (
  select pg_catalog.count(*) = 2 as ok
  from private_definers
  join pg_catalog.pg_proc as procedure
    on procedure.oid = pg_catalog.to_regprocedure(private_definers.signature)
  where procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and not pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege(
      'service_role', procedure.oid, 'EXECUTE'
    )
), expected_generation_tables(table_name) as (
  values
    ('profiles'), ('user_settings'), ('notification_preferences'),
    ('user_daily_quests'), ('user_daily_quest_days'), ('user_quests'),
    ('quest_completions'), ('prayers'), ('reflections'), ('journey_events'),
    ('growth_events'), ('user_milestones'), ('verse_bookmarks'),
    ('reading_progress'), ('chapters_read'), ('user_recent_verses')
), generation_triggers as (
  select pg_catalog.count(trigger.oid) = 16 as ok
  from expected_generation_tables as expected
  join pg_catalog.pg_class as relation on relation.relname = expected.table_name
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace and namespace.nspname = 'public'
  join pg_catalog.pg_trigger as trigger on trigger.tgrelid = relation.oid
  join pg_catalog.pg_proc as procedure on procedure.oid = trigger.tgfoid
  where trigger.tgname = 'enforce_user_sync_generation'
    and not trigger.tgisinternal
    and trigger.tgenabled <> 'D'
    and procedure.proname = 'enforce_user_sync_generation'
), revision_function as (
  select not procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[]
    and not pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege(
      'service_role', procedure.oid, 'EXECUTE'
    ) as ok
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.advance_account_sync_revision()'
  )
), timestamp_trigger_retired as (
  select not exists (
    select 1 from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = pg_catalog.to_regclass(
        'public.user_recent_verses'
      )
      and trigger.tgname = 'keep_newest_recent_verse'
      and not trigger.tgisinternal
      and trigger.tgenabled <> 'D'
  ) as ok
), retired_entry_points as (
  select
    pg_catalog.to_regprocedure(
      'public.replace_user_daily_quests(date,bigint,uuid,jsonb)'
    ) is null
    and pg_catalog.to_regprocedure(
      'public.upsert_mutable_account_rows(text,jsonb)'
    ) is null
    and pg_catalog.to_regprocedure('public.purge_user_data()') is null as ok
), retained_daily_boundary as (
  select public.daily_quest_sync_contract()
      = '{"contract":"biblequest_daily_quest_sync_v1","ok":true}'::jsonb as ok
)
select pg_catalog.jsonb_build_object(
  'contract', 'biblequest_account_sync_v4',
  'ok',
    coalesce((select ok from sync_table), false)
    and coalesce((select ok from revision_columns), false)
    and coalesce((select ok from revision_triggers), false)
    and coalesce((select ok from recent_verse_order), false)
    and coalesce((select ok from mutation_boundary), false)
    and coalesce((select ok from hardened_wrappers), false)
    and coalesce((select ok from hardened_private_invokers), false)
    and coalesce((select ok from hardened_private_definers), false)
    and coalesce((select ok from generation_triggers), false)
    and coalesce((select ok from revision_function), false)
    and coalesce((select ok from timestamp_trigger_retired), false)
    and coalesce((select ok from retired_entry_points), false)
    and coalesce((select ok from retained_daily_boundary), false)
);
$function$;

revoke execute on function public.account_sync_contract() from public;
grant execute on function public.account_sync_contract()
  to anon, authenticated, service_role;
