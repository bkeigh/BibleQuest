-- UI-chrome language preference (see src/lib/i18n). Scripture stays English.
alter table user_settings
  add column if not exists language text not null default 'en';
