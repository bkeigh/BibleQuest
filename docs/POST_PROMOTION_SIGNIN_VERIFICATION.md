# Verifying sign-in and sync straight after promotion

Everything here is mechanical and takes a few minutes. It exists so the window
between "promoted" and "known good" is short, because on 2026-08-14 a build
passed every identity, bundle, CSP, and CORS gate and still could not render
for a single visitor.

Run the checks in order. Stop at the first failure.

## 1. Prove the artifact renders before trusting it

Bundle and header gates do not catch a build that cannot render. **Load it in a
browser with cleared storage.**

```bash
curl -sS https://www.biblequest.co/api/health
```

Expect `release_sha` to be the newly promoted commit, `schema_contract 0038`,
and `auth_posture: configured`. A stale `release_sha` means the promotion did
not take.

Then open `https://www.biblequest.co/app` in a private window and confirm the
account screen actually paints. A spinner that never resolves is the 2026-08-14
signature.

## 2. Prove the service worker fix is live

In the browser console on `www.biblequest.co`:

```js
await (await fetch("/sw.js")).text().then((s) => ({
  fixed: s.includes('finish("silent")') && s.includes('outcome === "refused"'),
  old: s.includes("if (!(await challengeWebAuthClient(client)))"),
}));
```

`fixed: true, old: false` is required. Anything else means the worker did not
update — existing visitors keep the old one until it does.

## 3. Prove a sign-in request reaches Supabase

This is the failure that locked people out: the worker answered with a
synthetic 403 and the request never left the browser.

Sign in normally with a real address, **typing the code in the same tab**. Do
not open the email link — PKCE keeps its verifier in the browser that started
the flow, and finishing in Gmail's or Instagram's in-app browser can never
complete. If that happens the app now says so precisely rather than calling the
link invalid.

Then confirm server-side that the request actually arrived:

```sql
select timestamp, log_attributes['request.path'] as path,
       log_attributes['response.status_code'] as status
from logs
where source = 'edge_logs'
  and log_attributes['request.path'] like '/auth/v1/%'
order by timestamp desc limit 10;
```

A `/auth/v1/otp` row is the proof. **Zero rows means the request never left the
browser** — the original defect.

## 4. Prove the ready-quest sync fix works

This one affects web users independently of iOS. Sign in on a device holding a
**picked but unstarted** quest — the state that made a whole day unsyncable.

```sql
select count(*) as refusals
from logs
where source = 'postgres_logs'
  and event_message ilike '%replace_user_daily_quests: invalid row values%';
```

Expect no new rows after the promotion timestamp. Six accumulated between
2026-08-14 and 2026-08-15.

## 5. Prove the round trip

The actual objective. Add a prayer on the web, then open the phone signed in as
the same person and confirm it appears — and the reverse.

Server-side confirmation that it travelled rather than being typed twice:

```sql
select count(*) as prayers, max(created_at) as newest
from public.prayers where user_id = '<the account>';
```

## If something fails

Failures now name themselves, which they did not on 2026-08-15:

- `AUTH-REQUEST-BLOCKED` — the request died locally, usually this app's own
  service worker. Reopening clears it. It is **not** the visitor's connection,
  and no longer claims to be.
- `AUTH-NETWORK` — the browser genuinely reports no connection.
- `browser_mismatch` — the flow finished in a different browser than it
  started. Use the code, not the link.
- A sync signal categorised `invalid` — the server refused a row rather than
  the request. Check `postgres_logs` for the constraint.

Rollback is `ed28b0b`, recorded as `rollback_sha` in the health endpoint.
