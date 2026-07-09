-- Pick model: a user picks up to 3 quests per day (was: one assigned quest).
-- The day-level uniqueness gives way to (user, day, quest) uniqueness; the
-- sync engine replaces a day's rows wholesale (delete + insert) on push.

alter table user_daily_quests
  drop constraint if exists user_daily_quests_user_id_assigned_date_key;

alter table user_daily_quests
  add constraint user_daily_quests_user_day_quest_key
  unique (user_id, assigned_date, quest_slug);
