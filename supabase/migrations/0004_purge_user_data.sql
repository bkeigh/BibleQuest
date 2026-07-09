-- BibleQuest — account purge for "Clear my data" / restore-from-file.
-- Run after 0003_user_language.sql.
--
-- A signed-in "Clear my data" (or a restore from an exported file) resets the
-- local store; without also deleting the account copy, the next initial sync
-- merges every remote row straight back (see src/lib/sync/engine.ts). The
-- engine calls this when the store carries an account-purge tombstone for the
-- signed-in user.
--
-- SECURITY DEFINER so rows without user DELETE policies (profiles) go too,
-- but it only ever touches auth.uid()'s own rows — a caller can never purge
-- anyone else. Subscriptions are billing state, not journey data, and survive
-- on purpose. auth.users also survives: this clears data, not the account.

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
grant execute on function public.purge_user_data() to authenticated;
