-- Sync engine needs an idempotent upsert target: one row per user/book/chapter.
-- Applied to the live project 2026-07-08 (as add_chapters_read_unique).
-- Idempotent so a clean reset / re-apply never errors.
alter table chapters_read
  drop constraint if exists chapters_read_user_book_chapter_key;
alter table chapters_read
  add constraint chapters_read_user_book_chapter_key unique (user_id, book_slug, chapter);
