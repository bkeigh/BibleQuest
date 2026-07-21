-- Preserve the originating calendar day and durable source across devices.
alter table public.journey_events
  add column if not exists date_key date,
  add column if not exists source_id text;

-- Existing rows have no source timezone; UTC is a deterministic fallback.
update public.journey_events
set date_key = (occurred_at at time zone 'UTC')::date
where date_key is null;

-- Cached older clients omit date_key. Give those writes the same deterministic
-- UTC fallback while new clients continue supplying the true source-local day.
create or replace function public.ensure_journey_event_date_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date_key is null then
    new.date_key := (new.occurred_at at time zone 'UTC')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_journey_event_date_key on public.journey_events;
create trigger ensure_journey_event_date_key
before insert or update of occurred_at, date_key on public.journey_events
for each row execute function public.ensure_journey_event_date_key();

alter table public.journey_events
  alter column date_key set not null;

create index if not exists idx_journey_user_date
  on public.journey_events (user_id, date_key desc);
