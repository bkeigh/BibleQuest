-- Analytics consent is explicit opt-in. Earlier app versions and the original
-- database default used `true`, so existing true values are ambiguous: they may
-- be the old default rather than a user choice. Reset once and require a fresh
-- opt-in after the v7 client migration.

alter table user_settings
  alter column analytics_consent set default false;

update user_settings
set analytics_consent = false
where analytics_consent is distinct from false;
