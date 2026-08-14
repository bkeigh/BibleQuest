# Journey event identity rollout

> **STATUS (2026-08-14):** Completed rollout record. Migration 0014 has been applied in production since July 2026.


Migration `0014_journey_event_identity.sql` must be applied before deploying
the app commit that writes `journey_events.date_key` and `source_id`.
Its accepted SHA-256 identity is
`9497b745c5efc0c3f6c4c82e43e57c4fd9b34e8cfae12e6193226d564da50789`.
Do not edit, rename, repair, or insert a migration below it. The reviewed
daily-quest CAS follows only as `0015_transactional_daily_quest_sync.sql`;
`0013` is intentionally absent.

The migration is additive and rollout-safe:

- existing rows receive a deterministic UTC `date_key` because their original
  device timezone was never stored;
- cached older clients receive the same UTC fallback from the insert trigger;
- updated clients preserve the true source-local date and stable source ID;
- `source_id` remains nullable for historical rows that cannot be linked.

After applying the migration, verify that no Journey date is null:

```bash
supabase test db --local supabase/tests/0014_journey_event_identity.sql
```

The deterministic suite proves the reviewed UTC backfill, not-null contract,
legacy trigger, current source-local write, primary-key uniqueness, and nullable
historical-source behavior. On the target project, also verify the live count:

```sql
select count(*) as missing_date_keys
from public.journey_events
where date_key is null;
```

The expected result is `0`. Then deploy the app and verify one new prayer syncs
with both a local `date_key` and a `prayer:`-prefixed `source_id`. If the app
must roll back, leave the columns and trigger in place; use a later forward-only
migration for any schema correction.
