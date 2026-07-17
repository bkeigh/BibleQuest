-- BibleQuest — forward-only RLS and purge reconciliation.
--
-- Do not rename or renumber this migration after it has shipped. Earlier
-- migration files were renamed in Git, which can diverge from the versions in
-- supabase_migrations.schema_migrations. This migration is deliberately
-- self-contained and idempotent so every environment converges on the same
-- current policy state without rewriting migration history.
--
-- The transaction prevents a partially rebuilt policy set. All current public
-- tables are named explicitly so a missing table fails closed during rollout.

begin;

-- Public content/configuration.
alter table public.faith_providers enable row level security;
alter table public.bible_translations enable row level security;
alter table public.bible_books enable row level security;
alter table public.bible_chapters enable row level security;
alter table public.bible_verses enable row level security;
alter table public.daily_verses enable row level security;
alter table public.quest_templates enable row level security;
alter table public.prayer_prompts enable row level security;
alter table public.reflection_prompts enable row level security;
alter table public.milestones enable row level security;
alter table public.feature_flags enable row level security;

-- User-owned data.
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_daily_quests enable row level security;
alter table public.user_quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.prayers enable row level security;
alter table public.reflections enable row level security;
alter table public.verse_bookmarks enable row level security;
alter table public.reading_progress enable row level security;
alter table public.chapters_read enable row level security;
alter table public.journey_events enable row level security;
alter table public.growth_events enable row level security;
alter table public.user_milestones enable row level security;
alter table public.notification_preferences enable row level security;

-- Server-owned billing state. Clients can read only their own row and cannot
-- write it; trusted webhook/admin code uses the service role.
alter table public.subscriptions enable row level security;

-- Reconcile table privileges as well as policies. Current Supabase projects do
-- not necessarily auto-grant CRUD on newly migrated tables, while older
-- projects may retain overly broad default grants. Start from no privileges
-- for API roles, then add only what each role needs. RLS remains the row-level
-- enforcement layer for every authenticated operation.
revoke all privileges on table
  public.faith_providers,
  public.bible_translations,
  public.bible_books,
  public.bible_chapters,
  public.bible_verses,
  public.daily_verses,
  public.quest_templates,
  public.prayer_prompts,
  public.reflection_prompts,
  public.milestones,
  public.feature_flags,
  public.profiles,
  public.user_settings,
  public.user_daily_quests,
  public.user_quests,
  public.quest_completions,
  public.prayers,
  public.reflections,
  public.verse_bookmarks,
  public.reading_progress,
  public.chapters_read,
  public.journey_events,
  public.growth_events,
  public.user_milestones,
  public.notification_preferences,
  public.subscriptions
from anon, authenticated, service_role;

grant select on table
  public.faith_providers,
  public.bible_translations,
  public.bible_books,
  public.bible_chapters,
  public.bible_verses,
  public.daily_verses,
  public.quest_templates,
  public.prayer_prompts,
  public.reflection_prompts,
  public.milestones,
  public.feature_flags
to anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;

grant select, insert, update, delete on table
  public.user_settings,
  public.user_daily_quests,
  public.user_quests,
  public.quest_completions,
  public.prayers,
  public.reflections,
  public.verse_bookmarks,
  public.reading_progress,
  public.chapters_read,
  public.user_milestones,
  public.notification_preferences
to authenticated;

grant select, insert, delete on table
  public.journey_events,
  public.growth_events
to authenticated;

grant select on table public.subscriptions to authenticated;

grant all privileges on table
  public.faith_providers,
  public.bible_translations,
  public.bible_books,
  public.bible_chapters,
  public.bible_verses,
  public.daily_verses,
  public.quest_templates,
  public.prayer_prompts,
  public.reflection_prompts,
  public.milestones,
  public.feature_flags,
  public.profiles,
  public.user_settings,
  public.user_daily_quests,
  public.user_quests,
  public.quest_completions,
  public.prayers,
  public.reflections,
  public.verse_bookmarks,
  public.reading_progress,
  public.chapters_read,
  public.journey_events,
  public.growth_events,
  public.user_milestones,
  public.notification_preferences,
  public.subscriptions
to service_role;

-- Reassert the complete intended state, including removing any stale policy
-- names left by manual changes or earlier migration versions. This is scoped
-- to the 26 current application tables and runs atomically with recreation.
do $reconcile$
declare
  existing_policy record;
begin
  for existing_policy in
    select c.relname as table_name, p.polname as policy_name
    from pg_catalog.pg_policy as p
    join pg_catalog.pg_class as c on c.oid = p.polrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'faith_providers',
        'bible_translations',
        'bible_books',
        'bible_chapters',
        'bible_verses',
        'daily_verses',
        'quest_templates',
        'prayer_prompts',
        'reflection_prompts',
        'milestones',
        'feature_flags',
        'profiles',
        'user_settings',
        'user_daily_quests',
        'user_quests',
        'quest_completions',
        'prayers',
        'reflections',
        'verse_bookmarks',
        'reading_progress',
        'chapters_read',
        'journey_events',
        'growth_events',
        'user_milestones',
        'notification_preferences',
        'subscriptions'
      ]::name[])
  loop
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I',
      existing_policy.policy_name,
      existing_policy.table_name
    );
  end loop;
end
$reconcile$;

-- Public reads are limited to active, approved content. Child scripture rows
-- inherit the active state of their translation and faith provider. No public
-- content table has an INSERT, UPDATE, or DELETE policy.
create policy "content: faith_providers readable"
  on public.faith_providers for select to anon, authenticated
  using (is_active);

create policy "content: translations readable"
  on public.bible_translations for select to anon, authenticated
  using (
    is_active
    and exists (
      select 1
      from public.faith_providers as provider
      where provider.id = bible_translations.faith_provider_id
        and provider.is_active
    )
  );

create policy "content: books readable"
  on public.bible_books for select to anon, authenticated
  using (
    exists (
      select 1
      from public.bible_translations as translation
      join public.faith_providers as provider
        on provider.id = translation.faith_provider_id
      where translation.id = bible_books.translation_id
        and translation.is_active
        and provider.is_active
    )
  );

create policy "content: chapters readable"
  on public.bible_chapters for select to anon, authenticated
  using (
    exists (
      select 1
      from public.bible_books as book
      join public.bible_translations as translation
        on translation.id = book.translation_id
      join public.faith_providers as provider
        on provider.id = translation.faith_provider_id
      where book.id = bible_chapters.book_id
        and translation.is_active
        and provider.is_active
    )
  );

create policy "content: verses readable"
  on public.bible_verses for select to anon, authenticated
  using (
    exists (
      select 1
      from public.bible_chapters as chapter
      join public.bible_books as book on book.id = chapter.book_id
      join public.bible_translations as translation
        on translation.id = book.translation_id
      join public.faith_providers as provider
        on provider.id = translation.faith_provider_id
      where chapter.id = bible_verses.chapter_id
        and translation.is_active
        and provider.is_active
    )
  );

create policy "content: daily_verses readable"
  on public.daily_verses for select to anon, authenticated
  using (is_active);

create policy "content: quests readable"
  on public.quest_templates for select to anon, authenticated
  using (
    is_active
    and review_status = 'approved'
    and exists (
      select 1
      from public.faith_providers as provider
      where provider.id = quest_templates.faith_provider_id
        and provider.is_active
    )
  );

create policy "content: prayer_prompts readable"
  on public.prayer_prompts for select to anon, authenticated
  using (is_active);

create policy "content: reflection_prompts readable"
  on public.reflection_prompts for select to anon, authenticated
  using (is_active);

create policy "content: milestones readable"
  on public.milestones for select to anon, authenticated
  using (is_active);

create policy "content: feature_flags readable"
  on public.feature_flags for select to anon, authenticated
  using (enabled);

-- Profiles are owner-readable/writable but not client-deletable. The
-- authenticated purge function below is the sole client-facing deletion path.
create policy "own profile: select"
  on public.profiles for select to authenticated
  using (auth.uid() = id);
create policy "own profile: insert"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);
create policy "own profile: update"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "own settings: all"
  on public.user_settings for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own daily quests: all"
  on public.user_daily_quests for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own shelf quests: all"
  on public.user_quests for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own completions: all"
  on public.quest_completions for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own prayers: all"
  on public.prayers for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own reflections: all"
  on public.reflections for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own bookmarks: all"
  on public.verse_bookmarks for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own reading: all"
  on public.reading_progress for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own chapters read: all"
  on public.chapters_read for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Journey and growth events are append-only to the client: SELECT, INSERT,
-- and DELETE are owner-scoped, while UPDATE remains unavailable.
create policy "own journey: select"
  on public.journey_events for select to authenticated
  using (auth.uid() = user_id);
create policy "own journey: insert"
  on public.journey_events for insert to authenticated
  with check (auth.uid() = user_id);
create policy "own journey: delete"
  on public.journey_events for delete to authenticated
  using (auth.uid() = user_id);

create policy "own growth: select"
  on public.growth_events for select to authenticated
  using (auth.uid() = user_id);
create policy "own growth: insert"
  on public.growth_events for insert to authenticated
  with check (auth.uid() = user_id);
create policy "own growth: delete"
  on public.growth_events for delete to authenticated
  using (auth.uid() = user_id);

create policy "own milestones: all"
  on public.user_milestones for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own notif prefs: all"
  on public.notification_preferences for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Billing writes remain service-role/webhook-only: authenticated clients get
-- SELECT for their own row and no INSERT, UPDATE, or DELETE policy.
create policy "own subscription: select"
  on public.subscriptions for select to authenticated
  using (auth.uid() = user_id);

-- Every user-owned table is purged. subscriptions is deliberately excluded:
-- it is server-owned billing state, not user-authored journey data.
create or replace function public.purge_user_data()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'purge_user_data: not authenticated';
  end if;

  delete from public.user_quests              where user_id = uid;
  delete from public.user_daily_quests        where user_id = uid;
  delete from public.quest_completions        where user_id = uid;
  delete from public.prayers                  where user_id = uid;
  delete from public.reflections              where user_id = uid;
  delete from public.verse_bookmarks          where user_id = uid;
  delete from public.reading_progress         where user_id = uid;
  delete from public.chapters_read            where user_id = uid;
  delete from public.journey_events           where user_id = uid;
  delete from public.growth_events            where user_id = uid;
  delete from public.user_milestones          where user_id = uid;
  delete from public.user_settings            where user_id = uid;
  delete from public.notification_preferences where user_id = uid;
  delete from public.profiles                 where id = uid;
end;
$function$;

revoke execute on function public.purge_user_data() from public;
revoke execute on function public.purge_user_data() from anon;
grant execute on function public.purge_user_data() to authenticated;

commit;
