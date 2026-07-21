# Journey event identity rollout

Migration `0014_journey_event_identity.sql` must be applied before deploying
the app commit that writes `journey_events.date_key` and `source_id`.

The migration is additive and rollout-safe:

- existing rows receive a deterministic UTC `date_key` because their original
  device timezone was never stored;
- cached older clients receive the same UTC fallback from the insert trigger;
- updated clients preserve the true source-local date and stable source ID;
- `source_id` remains nullable for historical rows that cannot be linked.

After applying the migration, verify that no Journey date is null:

```sql
select count(*) as missing_date_keys
from public.journey_events
where date_key is null;
```

The expected result is `0`. Then deploy the app and verify one new prayer syncs
with both a local `date_key` and a `prayer:`-prefixed `source_id`. If the app
must roll back, leave the columns and trigger in place; use a later forward-only
migration for any schema correction.
