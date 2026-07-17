-- Rolling quest windows, durable recent-verse history, and deterministic
-- daily-verse identity. This migration is forward-only and idempotent.

begin;

alter table public.user_daily_quests
  add column if not exists picked_at timestamptz,
  add column if not exists expires_at timestamptz;

-- Legacy picks did not store a rolling window. Their immutable created_at is
-- the closest honest start time; never silently grant more than 24 hours.
update public.user_daily_quests
set picked_at = coalesce(picked_at, created_at),
    expires_at = coalesce(expires_at, coalesce(picked_at, created_at) + interval '24 hours')
where picked_at is null or expires_at is null;

alter table public.user_daily_quests
  alter column picked_at set default now(),
  alter column picked_at set not null,
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null;

create index if not exists idx_daily_quests_open_windows
  on public.user_daily_quests (user_id, expires_at)
  where status <> 'completed';

create table if not exists public.user_recent_verses (
  user_id     uuid not null references auth.users(id) on delete cascade,
  book_slug   text not null,
  book_name   text not null,
  chapter     int not null check (chapter > 0),
  verse_start int not null check (verse_start > 0),
  verse_end   int not null check (verse_end >= verse_start),
  reference   text not null,
  text        text not null,
  viewed_at   timestamptz not null default now(),
  primary key (user_id, book_slug, chapter, verse_start, verse_end)
);

create index if not exists idx_user_recent_verses_viewed
  on public.user_recent_verses (user_id, viewed_at desc);

alter table public.user_recent_verses enable row level security;

drop policy if exists "own recent verses: all" on public.user_recent_verses;
create policy "own recent verses: all"
  on public.user_recent_verses for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all privileges on table public.user_recent_verses
  from anon, authenticated, service_role;
grant select, insert, update, delete on table public.user_recent_verses
  to authenticated;
grant all privileges on table public.user_recent_verses to service_role;

-- Account sync writes the complete local top twenty after every merge. Without
-- a database guard, a stale device can upsert an older visit to the same
-- passage after another device recorded a newer one, silently moving that
-- passage backward in history. Preserve the entire newer row atomically; the
-- client-side cutoff prune can then safely remove only genuinely older rows.
create or replace function public.keep_newest_recent_verse()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.viewed_at <= old.viewed_at then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists keep_newest_recent_verse
  on public.user_recent_verses;
create trigger keep_newest_recent_verse
  before update on public.user_recent_verses
  for each row execute function public.keep_newest_recent_verse();

-- The function exists only as a table trigger, never as a client RPC.
revoke execute on function public.keep_newest_recent_verse()
  from public, anon, authenticated;

-- The checked-in daily pool is keyed by passage. Remove any old duplicates
-- before enforcing that natural key so repeated seeds remain idempotent.
with ranked as (
  select id,
         row_number() over (
           partition by book_slug, chapter, verse_start, verse_end
           order by is_active desc, id
         ) as ordinal
  from public.daily_verses
)
delete from public.daily_verses
where id in (select id from ranked where ordinal > 1);

create unique index if not exists daily_verses_passage_key
  on public.daily_verses (book_slug, chapter, verse_start, verse_end);

-- Keep Clear My Data complete as new user-owned tables are introduced.
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

  delete from public.user_recent_verses       where user_id = uid;
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
