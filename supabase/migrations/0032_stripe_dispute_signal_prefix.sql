-- Stripe Dispute objects use the `du_` prefix. Correct the bounded signal
-- constraint so signed dispute events can finish after projecting access.
alter table public.stripe_billing_signals
  drop constraint if exists stripe_signal_object_check;

alter table public.stripe_billing_signals
  add constraint stripe_signal_object_check check (
    stripe_object_id ~ '^(in|re|du)_[A-Za-z0-9]+$'
  );
