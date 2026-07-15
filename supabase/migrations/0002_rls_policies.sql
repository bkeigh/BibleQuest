-- BibleQuest — Row Level Security policies.
-- Numbered migration form of the former supabase/policies.sql (folded in so a
-- clean `supabase db reset` reproduces the deployed RLS state). Runs right
-- after 0001_init.sql, matching the deployed order (init -> rls_policies -> …).
--
-- Principle: users can read/write ONLY their own rows. Content tables are
-- world-readable when active and admin-written (writes happen with the service
-- role, which bypasses RLS). Prayer and reflection text are never exposed to
-- other users or to anonymous queries.
--
-- Idempotent: every policy is dropped-if-exists before create, so re-applying
-- (e.g. against production, which already has these) is a harmless no-op.

-- ---------------------------------------------------------------------------
-- Content tables: public read of active rows, no public writes.
-- ---------------------------------------------------------------------------
alter table faith_providers      enable row level security;
alter table bible_translations   enable row level security;
alter table bible_books          enable row level security;
alter table bible_chapters       enable row level security;
alter table bible_verses         enable row level security;
alter table daily_verses         enable row level security;
alter table quest_templates      enable row level security;
alter table prayer_prompts       enable row level security;
alter table reflection_prompts   enable row level security;
alter table milestones           enable row level security;
alter table feature_flags        enable row level security;

drop policy if exists "content: faith_providers readable"   on faith_providers;
drop policy if exists "content: translations readable"       on bible_translations;
drop policy if exists "content: books readable"              on bible_books;
drop policy if exists "content: chapters readable"           on bible_chapters;
drop policy if exists "content: verses readable"             on bible_verses;
drop policy if exists "content: daily_verses readable"       on daily_verses;
drop policy if exists "content: quests readable"             on quest_templates;
drop policy if exists "content: prayer_prompts readable"     on prayer_prompts;
drop policy if exists "content: reflection_prompts readable" on reflection_prompts;
drop policy if exists "content: milestones readable"         on milestones;
drop policy if exists "content: feature_flags readable"      on feature_flags;

create policy "content: faith_providers readable"    on faith_providers    for select using (is_active);
create policy "content: translations readable"        on bible_translations for select using (is_active);
create policy "content: books readable"               on bible_books        for select using (true);
create policy "content: chapters readable"            on bible_chapters     for select using (true);
create policy "content: verses readable"              on bible_verses       for select using (true);
create policy "content: daily_verses readable"        on daily_verses       for select using (is_active);
create policy "content: quests readable"              on quest_templates    for select using (is_active);
create policy "content: prayer_prompts readable"      on prayer_prompts     for select using (is_active);
create policy "content: reflection_prompts readable"  on reflection_prompts for select using (is_active);
create policy "content: milestones readable"          on milestones         for select using (is_active);
create policy "content: feature_flags readable"       on feature_flags      for select using (true);

-- ---------------------------------------------------------------------------
-- User-owned tables: owner-only for every operation.
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
drop policy if exists "own profile: select" on profiles;
drop policy if exists "own profile: insert" on profiles;
drop policy if exists "own profile: update" on profiles;
create policy "own profile: select" on profiles for select using (auth.uid() = id);
create policy "own profile: insert" on profiles for insert with check (auth.uid() = id);
create policy "own profile: update" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

alter table user_settings enable row level security;
drop policy if exists "own settings: all" on user_settings;
create policy "own settings: all" on user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_daily_quests enable row level security;
drop policy if exists "own daily quests: all" on user_daily_quests;
create policy "own daily quests: all" on user_daily_quests for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table quest_completions enable row level security;
drop policy if exists "own completions: all" on quest_completions;
create policy "own completions: all" on quest_completions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table prayers enable row level security;
drop policy if exists "own prayers: all" on prayers;
create policy "own prayers: all" on prayers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table reflections enable row level security;
drop policy if exists "own reflections: all" on reflections;
create policy "own reflections: all" on reflections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table verse_bookmarks enable row level security;
drop policy if exists "own bookmarks: all" on verse_bookmarks;
create policy "own bookmarks: all" on verse_bookmarks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table reading_progress enable row level security;
drop policy if exists "own reading: all" on reading_progress;
create policy "own reading: all" on reading_progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table chapters_read enable row level security;
drop policy if exists "own chapters read: all" on chapters_read;
create policy "own chapters read: all" on chapters_read for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table journey_events enable row level security;
drop policy if exists "own journey: select" on journey_events;
drop policy if exists "own journey: insert" on journey_events;
drop policy if exists "own journey: delete" on journey_events;
create policy "own journey: select" on journey_events for select using (auth.uid() = user_id);
create policy "own journey: insert" on journey_events for insert with check (auth.uid() = user_id);
create policy "own journey: delete" on journey_events for delete using (auth.uid() = user_id);

alter table growth_events enable row level security;
drop policy if exists "own growth: select" on growth_events;
drop policy if exists "own growth: insert" on growth_events;
drop policy if exists "own growth: delete" on growth_events;
create policy "own growth: select" on growth_events for select using (auth.uid() = user_id);
create policy "own growth: insert" on growth_events for insert with check (auth.uid() = user_id);
create policy "own growth: delete" on growth_events for delete using (auth.uid() = user_id);

alter table user_milestones enable row level security;
drop policy if exists "own milestones: all" on user_milestones;
create policy "own milestones: all" on user_milestones for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table notification_preferences enable row level security;
drop policy if exists "own notif prefs: all" on notification_preferences;
create policy "own notif prefs: all" on notification_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Subscriptions: users may READ their own status; writes are webhook/admin only
-- (service role bypasses RLS). No user insert/update policy on purpose.
alter table subscriptions enable row level security;
drop policy if exists "own subscription: select" on subscriptions;
create policy "own subscription: select" on subscriptions for select using (auth.uid() = user_id);
