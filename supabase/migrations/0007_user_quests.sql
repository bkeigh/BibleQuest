-- BibleQuest — My Quests: the persistent quest shelf.
-- Run after 0004_purge_user_data.sql.
--
-- Multi-quest lifecycle: a quest joins the shelf when picked, begun, or
-- saved for later and keeps its own status + step progress until the user
-- removes it. One row per (user, quest) — the PK doubles as the idempotent
-- upsert target for the sync engine's write-through pushes. Removals
-- propagate as deletes via the shelf tombstones (src/lib/sync/engine.ts).
--
-- Also: per-user analytics consent (Settings → Privacy) so the choice
-- follows the account across devices.

create table if not exists user_quests (
  user_id          uuid not null references auth.users(id) on delete cascade,
  quest_slug       text not null,
  -- 'saved' | 'active' | 'paused' | 'completed' | 'archived'
  -- (validated in app code like every other status column here)
  status           text not null default 'active',
  -- step keys done on the current walk: 'scripture' | 'live' | 'reflect' | 'pray'
  steps_done       text[] not null default '{}',
  times_completed  int  not null default 0,
  added_at         timestamptz not null default now(),
  started_at       timestamptz,
  paused_at        timestamptz,
  completed_at     timestamptz,
  archived_at      timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  primary key (user_id, quest_slug)
);

alter table user_quests enable row level security;
drop policy if exists "own shelf quests: all" on user_quests;
create policy "own shelf quests: all" on user_quests for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_settings
  add column if not exists analytics_consent boolean not null default true;

-- Extend the account purge to cover the shelf (see 0004 for rationale —
-- any new user-owned table missing from this list resurrects on the next
-- initial sync after a signed-in "Clear my data").
create or replace function public.purge_user_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'purge_user_data: not authenticated';
  end if;

  delete from user_quests              where user_id = uid;
  delete from user_daily_quests        where user_id = uid;
  delete from quest_completions        where user_id = uid;
  delete from prayers                  where user_id = uid;
  delete from reflections              where user_id = uid;
  delete from verse_bookmarks          where user_id = uid;
  delete from reading_progress         where user_id = uid;
  delete from chapters_read            where user_id = uid;
  delete from journey_events           where user_id = uid;
  delete from growth_events            where user_id = uid;
  delete from user_milestones          where user_id = uid;
  delete from user_settings            where user_id = uid;
  delete from notification_preferences where user_id = uid;
  delete from profiles                 where id = uid;
end;
$$;

revoke execute on function public.purge_user_data() from public;
revoke execute on function public.purge_user_data() from anon;
grant execute on function public.purge_user_data() to authenticated;
