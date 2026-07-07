-- BibleQuest — QuestOS V1 schema
-- Postgres / Supabase. Run before policies.sql and seed.sql.
--
-- Design notes:
--  * Every user-owned table carries user_id -> auth.users and is protected by
--    Row Level Security (see policies.sql). Prayer and reflection body text are
--    sensitive; they never leave the row for analytics or logs.
--  * Content tables (faith_providers, bible_*, quest_templates, milestones) are
--    world-readable when active, admin-written.
--  * BibleQuest V1 also runs fully client-side (guest mode). This schema powers
--    optional account sync. See docs/SETUP.md.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Content: faith providers, denominations, translations, scripture
-- ---------------------------------------------------------------------------

create table if not exists faith_providers (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  description text,
  canonical_text_label text not null default 'Bible',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bible_translations (
  id uuid primary key default gen_random_uuid(),
  faith_provider_id uuid references faith_providers(id) on delete cascade,
  key text unique not null,
  name text not null,
  abbreviation text not null,
  copyright_status text not null default 'public_domain',
  license_notes text,
  is_default boolean not null default false,
  is_active boolean not null default true
);

create table if not exists bible_books (
  id uuid primary key default gen_random_uuid(),
  translation_id uuid references bible_translations(id) on delete cascade,
  testament text not null check (testament in ('old', 'new')),
  name text not null,
  slug text not null,
  order_index int not null,
  unique (translation_id, slug)
);

create table if not exists bible_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references bible_books(id) on delete cascade,
  chapter_number int not null,
  unique (book_id, chapter_number)
);

create table if not exists bible_verses (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references bible_chapters(id) on delete cascade,
  verse_number int not null,
  text text not null,
  reference text not null,
  unique (chapter_id, verse_number)
);
create index if not exists idx_bible_verses_chapter on bible_verses (chapter_id);

create table if not exists daily_verses (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  book_slug text not null,
  chapter int not null,
  verse_start int not null,
  verse_end int not null,
  text text not null,
  theme text,
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Content: quests, prompts, milestones
-- ---------------------------------------------------------------------------

create table if not exists quest_templates (
  id uuid primary key default gen_random_uuid(),
  faith_provider_id uuid references faith_providers(id) on delete cascade,
  slug text unique not null,
  title text not null,
  category text not null,
  duration_minutes int not null,
  difficulty text not null,
  energy_level text not null,
  solo_or_social text not null,
  indoor_or_outdoor text not null,
  invitation text not null,
  why_it_matters text not null,
  scripture_reference text,
  scripture_text_snapshot text,
  reflection_prompt text not null,
  prayer_prompt text,
  growth_type text not null,
  tags text[] not null default '{}',
  season_tags text[] not null default '{}',
  tradition_tags text[] not null default '{}',
  sensitivity_tags text[] not null default '{}',
  is_premium boolean not null default false,
  is_active boolean not null default true,
  review_status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quest_templates_category on quest_templates (category);
create index if not exists idx_quest_templates_duration on quest_templates (duration_minutes);

create table if not exists prayer_prompts (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  text text not null,
  category text not null,
  is_active boolean not null default true
);

create table if not exists reflection_prompts (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  text text not null,
  context text not null,
  is_active boolean not null default true
);

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text not null,
  milestone_type text not null,
  requirement_metric text not null,
  requirement_count int not null,
  icon_key text,
  is_active boolean not null default true
);

create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  description text,
  enabled boolean not null default false,
  audience text
);

-- ---------------------------------------------------------------------------
-- User data (RLS-protected)
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'friend',
  faith_provider_id uuid references faith_providers(id),
  tradition text,
  primary_goal text,
  calling text,
  daily_rhythm text,
  quest_style text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'light',
  reduced_motion boolean not null default false,
  text_size text not null default 'default',
  quest_duration_pref int[] not null default '{}',
  quest_category_pref text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists user_daily_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_template_id uuid references quest_templates(id),
  quest_slug text not null,
  assigned_date date not null,
  status text not null default 'assigned',
  rerolls int not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, assigned_date)
);
create index if not exists idx_daily_quests_user on user_daily_quests (user_id);

create table if not exists quest_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_slug text not null,
  reflection_id uuid,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_completions_user on quest_completions (user_id);

create table if not exists prayers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null,
  category text not null default 'general',
  status text not null default 'active',
  answered_at timestamptz,
  answer_reflection text,
  reminder_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_prayers_user on prayers (user_id);

create table if not exists reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text,
  body text not null,
  mood text,
  related_quest_slug text,
  related_verse_reference text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reflections_user on reflections (user_id);

create table if not exists verse_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_slug text not null,
  book_name text not null,
  chapter int not null,
  verse int not null,
  text text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, book_slug, chapter, verse)
);

create table if not exists reading_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  book_slug text not null,
  book_name text not null,
  chapter int not null,
  updated_at timestamptz not null default now()
);

create table if not exists chapters_read (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_slug text not null,
  chapter int not null,
  read_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_chapters_read_user on chapters_read (user_id);

create table if not exists journey_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_journey_user on journey_events (user_id, occurred_at desc);

create table if not exists growth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  growth_type text not null,
  amount int not null default 1,
  source_type text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_growth_user on growth_events (user_id);

create table if not exists user_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_key text not null,
  achieved_at timestamptz not null default now(),
  unique (user_id, milestone_key)
);

create table if not exists notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_verse_enabled boolean not null default false,
  daily_quest_enabled boolean not null default false,
  prayer_reminders_enabled boolean not null default false,
  weekly_recap_enabled boolean not null default false,
  preferred_time text,
  timezone text,
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text,
  status text not null default 'none',
  plan_key text not null default 'free',
  current_period_start timestamptz,
  current_period_end timestamptz,
  external_customer_id text,
  external_subscription_id text,
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'friend'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
