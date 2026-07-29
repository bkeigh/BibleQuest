-- Stripe subscription upserts must target a full unique constraint because
-- PostgREST cannot infer the earlier partial unique index for ON CONFLICT.
drop index if exists public.subscriptions_external_subscription_idx;

alter table public.subscriptions
  drop constraint if exists subscriptions_external_subscription_key;

-- PostgreSQL unique constraints still permit multiple NULL values, so lifetime
-- purchases can continue storing no external subscription identifier.
alter table public.subscriptions
  add constraint subscriptions_external_subscription_key
  unique (external_subscription_id);
