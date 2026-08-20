# Verifying sign-in and sync after an approved promotion

This checklist starts only after Brendan has approved and performed the exact
promotion. It does not approve a merge, push, promotion, redeployment,
Production configuration or database change, or rollback. Production dashboard
and log access, plus every recovery action, also stay Brendan-only.

The checks are mechanical and take a few minutes. They identify the current
failure stage instead of assuming that one old incident explains a new symptom.
Record only sanitized results: UTC time, release/build identifiers, the bounded
reference shown by BibleQuest, and pass/fail. Do not copy an email address,
account identifier, token, private text, or raw provider response into evidence.

Before starting, Brendan records the candidate commit, expected health contract,
and exact eligible previous known-good deployment in the approved release
packet. Run these checks in order and stop at the first failure. A failed check
is a hold for Brendan to review, not permission for anyone else to change
Production.

## 1. Prove the artifact renders before trusting it

Bundle and header gates do not catch a build that cannot render. **Load it in a
browser with cleared storage.**

```bash
curl -sS https://www.biblequest.co/api/health
```

Expect `release_sha`, `schema_contract`, `auth_posture`, and
`service_worker_version` to match the approved release packet exactly. A
mismatch means the promoted artifact is not the approved candidate; stop and
hand the sanitized result to Brendan.

Then open `https://www.biblequest.co/app` in a private window and confirm the
account screen actually paints. A spinner that never resolves is a failure even
when health passes; stop and record it without guessing the cause.

## 2. Prove the exact service worker is live

In the browser console on `www.biblequest.co`:

```js
await fetch("/sw.js", { cache: "no-store" }).then((response) =>
  response.text(),
).then((source) => ({
  servedVersion:
    source.match(/const CACHE_VERSION = "([^"]+)"/)?.[1] ?? null,
  boundedSilentClient: source.includes('finish("silent")'),
  refusalOnly: source.includes('outcome === "refused"'),
}));
```

`servedVersion` must equal the `service_worker_version` from health, and both
booleans must be `true`. Then ask the controlling worker which version is
active:

```js
await new Promise((resolve) => {
  const worker = navigator.serviceWorker.controller;
  if (!worker) {
    resolve({ error: "no_controller" });
    return;
  }
  const onMessage = (event) => {
    if (event.data?.type !== "BIBLEQUEST_SW_VERSION_RESPONSE") return;
    clearTimeout(timer);
    navigator.serviceWorker.removeEventListener("message", onMessage);
    resolve({ activeVersion: event.data.version });
  };
  const timer = setTimeout(() => {
    navigator.serviceWorker.removeEventListener("message", onMessage);
    resolve({ error: "timeout" });
  }, 3_000);
  navigator.serviceWorker.addEventListener("message", onMessage);
  worker.postMessage({ type: "BIBLEQUEST_SW_VERSION_REQUEST" });
});
```

`activeVersion` must equal the served and health versions. `no_controller`,
`timeout`, or a mismatch is a hold. These checks prove the worker version and
bounded protocol; they do not, by themselves, prove that a later request
failure came from the worker.

## 3. Prove a sign-in request reaches Supabase

Sign in with the approved disposable test address, **typing the code in the same
tab**. Do not use the email link for this check. PKCE keeps its verifier in the
browser that started the flow, so opening a link in a different browser can
produce the precise `browser_mismatch` result below.

Then Brendan confirms in the approved read-only Production log view that the
request arrived:

```sql
select timestamp, log_attributes['request.path'] as path,
       log_attributes['response.status_code'] as status
from logs
where source = 'edge_logs'
  and log_attributes['request.path'] in ('/auth/v1/otp', '/auth/v1/verify')
order by timestamp desc limit 10;
```

A matching `/auth/v1/otp` row proves the email request reached Supabase. A
matching `/auth/v1/verify` row proves the code-verification request reached it.
Record only the stage, UTC time, and status. No matching row means reachability
is not proven; use the bounded BibleQuest reference below and browser Network
evidence to find the stage instead of naming a cause from the missing row alone.

## 4. Prove the ready-quest sync fix works

This one affects web users independently of iOS. Sign in on a test device
holding a **picked but unstarted** synthetic quest — the state that made a whole
day unsyncable. Brendan runs this read-only Production log check:

```sql
select count(*) as refusals
from logs
where source = 'postgres_logs'
  and timestamp >= '<PROMOTION UTC>'
  and event_message ilike '%replace_user_daily_quests: invalid row values%';
```

Expect `0`. Keep raw log text in the restricted view; record only the count and
UTC window in shared evidence.

## 5. Prove the round trip

The actual objective. Add a short synthetic prayer with no real person's name
or private story on the web, then open the test phone signed in as the same
account and confirm it appears — and the reverse.

Brendan-only server-side confirmation that it travelled rather than being
typed twice:

```sql
select count(*) as prayers, max(created_at) as newest
from public.prayers where user_id = '<the account>';
```

Keep the account identifier in the restricted query only. The shared evidence
contains the aggregate result, not the identifier or prayer text.

## If something fails

Use the exact bounded reference shown by BibleQuest:

| Reference | What it means | First safe check |
| --- | --- | --- |
| `AUTH-TAB-BUSY` | Another BibleQuest tab still owns the short account-operation lock. | Finish there or close the other BibleQuest tabs, then retry once. |
| `AUTH-SERVICE-WORKER-UNAVAILABLE` | The current worker readiness or exact-protocol proof did not complete. | Close every BibleQuest tab, reopen it, and repeat step 2. Do not assume a response status or a network fault. |
| `AUTH-REQUEST-TIMEOUT` | The complete user-started sign-in request exceeded its deadline. | Check whether the matching request reached Supabase, then retry once. |
| `AUTH-REQUEST-FETCH-FAILED` | The browser reported online, but its fetch could not connect. | Inspect the browser Network and CSP evidence plus the matching server log. This reference alone does not identify the blocker. |
| `AUTH-NETWORK` | The browser reported that the device was offline. | Reconnect, then retry. |
| `AUTH-INSTALL-INCOMPLETE` | Supabase accepted and consumed the email code, but this device did not finish installing the session. | Do not blame or reuse the code. Record the install-stage failure and stop repeated attempts. |
| `browser_mismatch` | The callback finished in a different browser from the one that began it. | Enter the code in the original tab, or open a fresh link in that same browser. |

A sync signal categorised `invalid` means the server refused a row rather than
the request. Brendan may check the restricted `postgres_logs` view for the
constraint; shared evidence keeps only the bounded category and result.

Do not copy a rollback SHA or deployment from this document. The
`rollback_sha` returned by health is runtime metadata, not proof that a target
is eligible and not approval to use it. On any failure, stop. Brendan compares
the live deployment with the exact previous known-good deployment in the
approved release packet, verifies database and service-worker compatibility,
and alone decides whether to continue, contain, forward-fix, redeploy, or roll
back. Follow [the launch rollback procedure](LAUNCH_RUNBOOK.md#9-rollback-and-recovery)
without changing Production from this checklist.
