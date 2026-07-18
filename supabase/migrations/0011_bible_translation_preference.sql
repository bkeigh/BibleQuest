-- Account-backed Bible edition preference. This is a preference, not a claim
-- that the edition is licensed: clients resolve it through the configured
-- provider and explicitly fall back to bundled WEB when unavailable.
alter table public.user_settings
  add column if not exists preferred_bible_translation text not null default 'niv';

-- Bookmark snapshots continue to store the bundled WEB fallback text; this
-- key identifies the edition to resolve transiently when the bookmark opens.
alter table public.verse_bookmarks
  add column if not exists translation_key text not null default 'web';

alter table public.verse_bookmarks
  drop constraint if exists verse_bookmarks_user_id_book_slug_chapter_verse_key;

create unique index if not exists verse_bookmarks_passage_translation_key
  on public.verse_bookmarks
    (user_id, book_slug, chapter, verse, translation_key);
