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

## Precise mechanism

`reconcileWebAuthStorage()` bootstraps the web session on mount. For a visitor
with no stored session (`state.status === "missing"`) it classifies what to do
with `decideMissingWebAuthRecovery(readLocalJourneyOwner())`:

- `unowned` -> `acceptFreshGuest()`, which adopts the guest write generation,
  sets `webBootstrapComplete`, and clears loading. This is the correct path.
- `owned` -> the locked-journey recovery UI.
- anything else -> `closeAccount()`, which sets `setSessionLoading(true)` and
  shows no recovery controls. **That is the hang state**: a permanent veil with
  no error and no way out.

`readLocalJourneyOwner()` reads through the v2 private boundary, and that read
is refused until a write generation has been adopted. On a first visit none has
been, so the owner resolves to neither `unowned` nor `owned`, the decision falls
to `closed`, and `closeAccount()` strands the session as permanently loading.

The dependency is circular: adopting the generation requires classifying the
owner as `unowned`, and classifying the owner requires a read that only an
adopted generation permits.

A confirmed contributing factor is that the fresh-guest path is also reachable
from the `catch` around `requireCurrentWebAccountRealm`. Where service-worker
attestation fails — a headless Playwright context, or any environment without a
controlling worker — execution enters that catch and can still reach
`acceptFreshGuest()`. On a real deployment attestation succeeds, so that escape
hatch never runs. This is why every browser test passes and every real
deployment hangs.

**Not yet proven:** the exact value `readLocalJourneyOwner()` returns on a first
visit was inferred from the code path and the observed storage, not observed
directly. Confirm it before changing the classification, because the fix must
break the circular dependency without weakening the boundary that keeps one
account's data from being read under another's generation.

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
