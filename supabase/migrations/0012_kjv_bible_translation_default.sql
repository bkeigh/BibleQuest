-- New account rows should match the app's keyless HelloAO KJV default.
-- Existing rows remain untouched because they may represent a user choice.
alter table public.user_settings
  alter column preferred_bible_translation set default 'kjv';
