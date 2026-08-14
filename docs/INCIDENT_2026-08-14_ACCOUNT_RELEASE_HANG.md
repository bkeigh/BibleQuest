# Incident — account release hang on promotion, 2026-08-14

**Status: production recovered and healthy. `main` is NOT deployable.**

## What happened

The account release (`03b8078`) was promoted to the customer domains. Every
visit to `/app` or `/onboarding` then hung permanently on the
"Restoring your journey" loading screen. The build was rolled back to
`ed28b0b` within minutes of detection and production recovered fully.

The hang affected **every visitor**, not only ones with existing data: it
reproduces with completely empty browser storage.

## Root cause

`AccountRestoreBoundary` renders the loading veil while `useSession().loading`
is true. On web that value stays true until the v2 private-write generation is
adopted. For a first-time web visitor that adoption never happens.

After a load against the promoted build, the only key present is:

    biblequest:web-auth:v2:migration-complete

There is no `biblequest:web-private-write-generation:v1`, no
`biblequest:web-private:namespace:v2`, and no guest provenance marker. So
`webPrivateReadAllowed()` can never return true, `sessionLoading` never
clears, and the veil never lifts. The service worker was healthy and
attesting; `exactActiveController()`'s 15-second timeout is not involved —
the page was still hung after 30+ seconds.

The failing path is guest adoption: a visitor with no account and no legacy
data never establishes never-owned guest provenance, so the generation is
never adopted.

## Precise mechanism (corrected)

An earlier revision of this document blamed a circular dependency in
`readLocalJourneyOwner()`. **That was wrong** and is retracted: on a first
visit the namespace state is `legacy`, the selector returns the legacy owner
key, the value is absent, and the owner correctly resolves to `unowned`.

The real cause is a race on `authStorageRead`.

`reconcileWebAuthStorage()` captures `read = ++authStorageRead` and re-checks
`read !== authStorageRead` after each await, abandoning itself if the counter
moved. The `onAuthStateChange` handler incremented that same counter as its
first statement — *before* its `!webBootstrapComplete` guard. On a real
deployment Supabase emits `INITIAL_SESSION` shortly after subscribe, so:

1. the bootstrap starts and takes `read = 1`;
2. `INITIAL_SESSION` arrives, bumps the counter to 2, then returns at the
   `!webBootstrapComplete` guard without doing any work;
3. the bootstrap reaches its next guard, sees `1 !== 2`, and abandons itself.

Nothing clears `sessionLoading`, so the veil never lifts and no recovery UI
appears. The observed storage pins this exactly: `web-auth:v2:migration-complete`
is written immediately before one of those guards, and nothing after it ran.

Local and CI runs never saw it because their fixture Supabase host never
completes the handshake that emits the racing event.

## Fix status — partial, not merged

`codex/fix-web-bootstrap-race` (`c31980d`) defers the counter bump until after
the bootstrap completes. Verified on a real deployment in a browser: the
infinite veil is gone and the private write generation is now adopted
(`biblequest:web-private-write-generation:v1` is written, which never happened
before).

**A second defect remains.** A visitor with empty storage still lands on the
"Is this your journey?" keep/clear gate rather than going straight into the
app, and pressing "Keep this local journey" does not advance. Two things to
chase there:

- the app writes `biblequest:analytics-consent` during load, so by the time
  classification runs the device no longer looks empty and is treated as
  ambiguous legacy data; and
- the keep action itself does not complete, so the gate never resolves.

Do not promote until a browser on a real deployment reaches the app from empty
storage.

## Why the existing tests did not catch it

Each layer tested something adjacent to the broken case:

- **Browser smoke** seeds a legacy `biblequest:v1` journey and clicks "Keep
  this local journey". That path adopts through the *ambiguous legacy
  recovery* branch, which works. The empty-storage first-visit path was never
  exercised end to end.
- **CI builds** use a fixture Supabase host. Requests fail fast there, which
  pushes the state machine down an error path that clears loading. Production
  has a real, responsive Supabase and takes the path that waits forever.
- **Artifact audits** verified identity, bundle contents, headers, and native
  CORS. None of them loaded the application in a browser. An artifact can pass
  every one of those gates and still never render.

## What this costs and what it does not

No user data was lost or exposed. No client completed a v2 cutover — the hang
occurs before cutover — so exact `ed28b0b` remained a valid rollback and was
used. The containment artifact was not needed.

Migrations `0038` and `0037` are applied to Production and are **correct to
leave applied**: `ed28b0b` tolerates both, `0037`'s availability flag is off
(`available: false`), and the deletion regression proved the deletion path
against this schema.

## Current state

| Thing | State |
| --- | --- |
| Customer domains | `ed28b0b`, schema contract 0036, worker v26 — healthy, verified with cleared storage and no service worker |
| Production database | 0038 and 0037 applied; native availability flag off |
| `main` | `03b8078` — contains the hanging build. **Do not promote.** |
| Rollback artifact | `codex/v2-containment-rollback`, staged; not needed for this rollback |

## Required before any re-promotion

1. Fix guest adoption so a first visit with empty storage establishes the
   private-write generation and clears `sessionLoading`.
2. Add an end-to-end case that loads `/app` **with empty storage** and asserts
   the app renders — the case whose absence let this ship. It must run against
   a backend that actually responds, not a fixture host that fails fast.
3. Re-run the artifact audits **and** load the artifact in a browser before
   promoting. Bundle and header gates are necessary and not sufficient.
