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

### Lead for the remaining defect

Adoption now runs but still reports failure. On the fixed build a first visit
writes both `biblequest:web-private-write-generation:v1` and
`biblequest:web-private:legacy-guest:v1`, yet the UI lands on the keep/clear
gate — which is `showLockedLocalJourney()`, reached when `acceptFreshGuest()`
sees `adopted === false`.

That combination points at the tail of
`adoptCurrentWebPrivateWriteGeneration()`:

    adoptedPrivateWriteGeneration = generation;
    adoptedPrivateReadAuthority = { generation, kind: "guest" };
    if (!(await coordinateCurrentWebPrivateJourney()) || !webPrivateReadAllowed()) {
      revokeWebPrivateMemory();
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
      privateWriteGenerationInvalidated = true;
      return false;
    }

The generation is written to storage *before* this gate and is not rolled back
when the gate fails, which is exactly the observed state: key present, adoption
false. So the next thing to establish is why
`coordinateQuestOSWebPrivateHydration()` returns false on a first visit — it is
reached through `coordinateCurrentWebPrivateJourney()` and returns false early
when its own `authorizationIsCurrent()` check fails.

Because `privateWriteGenerationInvalidated` is set to true on that failure, a
retry within the same page cannot recover, which is consistent with "Keep this
local journey" not advancing.

Start there, with a browser on a real deployment and instrumentation inside
`coordinateQuestOSWebPrivateHydration`. Confirm before changing: the failure
must be fixed without weakening the read authority that keeps one account's
data from being read under another's generation.

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


## Verified state of the fix branch (`codex/fix-web-bootstrap-race`, `283e8a9`)

Two real defects are fixed and verified in a browser on a real deployment:

1. **The infinite veil is gone.** `onAuthStateChange` no longer bumps
   `authStorageRead` before the bootstrap completes, so `INITIAL_SESSION` can
   no longer cancel the in-flight bootstrap.
2. **Guest adoption is retried after provenance is durable.** Never-owned
   provenance is a precondition of guest adoption, so the first attempt fails
   by design on a first visit; the code established provenance but never
   retried, and assigned the provenance result to `adopted`.

A first visit now reaches interactive UI rather than a permanent veil, and
storage shows the expected state:

    biblequest:web-private-write-generation:v1 = <32 hex>
    biblequest:web-private:legacy-guest:v1     = never-owned

**Still failing.** With both preconditions satisfied, a first visit still lands
on the "Is this your journey?" gate rather than the app, which means
`adoptCurrentWebPrivateWriteGeneration()` continues to return false. Since the
guest branch and its `durableNeverOwnedGuestState` precondition now demonstrably
pass, the remaining failure is the tail gate:

    if (!(await coordinateCurrentWebPrivateJourney()) || !webPrivateReadAllowed()) {
      revokeWebPrivateMemory();
      ...
      privateWriteGenerationInvalidated = true;
      return false;
    }

`coordinateCurrentWebPrivateJourney()` delegates to
`coordinateQuestOSWebPrivateHydration()`, which returns false either at its
initial `authorizationIsCurrent()` check or at its post-`rehydrate()` re-check
of epoch, authorisation, and selected storage key. Because that failure also
sets `privateWriteGenerationInvalidated`, no in-page retry — including the
"Keep this local journey" button — can recover.

**Next step:** instrument those three post-rehydrate conditions in
`coordinateQuestOSWebPrivateHydration()` and load a real deployment with empty
storage to see which one trips. Fix it without weakening the read authority
that keeps one account's data from being read under another's generation.


## Narrowing, round 2 — hydration is NOT the failure point

Instrumented `coordinateQuestOSWebPrivateHydration()` on a real deployment
(diagnostic build `b5f0d40`) with logging on its pre-rehydrate authorization
check and each of its three post-rehydrate conditions, then loaded `/app` with
empty storage and no service worker.

**No diagnostic fired at all** — not the failure branches, not the success
branch. That function is never reached. The earlier lead pointing at it is
therefore **eliminated**; do not spend time there.

So `adoptCurrentWebPrivateWriteGeneration()` returns false *before* its tail
gate. What is already ruled out by observation:

- the guest `stateMatches` check passes at least once — a generation is created
  and written (`biblequest:web-private-write-generation:v1` is present);
- `durableNeverOwnedGuestState()` is satisfiable — the legacy provenance marker
  reads exactly `never-owned` and the v2 provenance key is absent;
- `scrubLegacyWebAuthCookies()` has no work to do and should succeed —
  `document.cookie` is empty on a first visit, and `legacyStorageKey()` resolves
  from the inlined `NEXT_PUBLIC_SUPABASE_URL` on a deployed build.

That leaves the guest-only gate between generation creation and the hydration
call, and the generation bookkeeping immediately around it:

    if (!expectedUserId && !(await withWebAuthStorageLock(async () => {
      const storage = localStorageSurface();
      return Boolean(
        storage &&
          readPrivateWriteGeneration(storage) === generation &&
          durableNeverOwnedGuestState(storage) &&
          scrubLegacyWebAuthCookies() &&
          durableNeverOwnedGuestState(storage),
      );
    }))) {
      return false;
    }

**Next step:** put the same style of logging inside
`adoptCurrentWebPrivateWriteGeneration()` — one line per gate, including the
early `privateWriteGenerationInvalidated` return and each conjunct of the guest
gate above — and reload a real deployment with empty storage. That will name the
exact conjunct in one pass. The diagnostic build pattern is on
`codex/fix-web-bootstrap-race`; remove all `[bq-diag]` logging before merge.


## Narrowing, round 3 — the exact failure, with traces

Instrumented every gate of `adoptCurrentWebPrivateWriteGeneration()` and every
conjunct of `durableNeverOwnedGuestState()`, then loaded `/app` on a real
deployment with empty storage and no service worker.

Observed console trace, in order:

    adopt: enter {guest: true}
    guestState { ... legacyProvenanceMatches: false ... }
    adopt: GATE B stateMatches/generation null
    adopt: enter {guest: true}
    guestState { ... legacyProvenanceMatches: false ... }
    adopt: GATE B stateMatches/generation null
    adopt: enter {guest: true}
    adopt: GATE A invalidated

Final storage on that same page:

    biblequest:web-private-write-generation:v1 = <32 hex>
    biblequest:web-private:legacy-guest:v1     = never-owned
    (no v2 owner / initial / claim / provenance keys, envelope absent,
     namespace state "legacy")

**Every conjunct of `durableNeverOwnedGuestState()` is satisfied in the final
state.** The two evaluations that actually ran both happened *before* the
never-owned marker existed, so both correctly returned false. The marker is
written only afterwards. By the third adoption attempt the generation has been
invalidated, so it returns at GATE A without re-evaluating anything.

In other words: **the establishment of never-owned provenance and the retry of
adoption are not correctly ordered.** `withNeverOwnedWebPrivateGuestProvenance()`
returns before its marker is durably readable by the next adoption attempt, and
it also reports failure even though the write ultimately lands. Making the retry
unconditional (already done on the fix branch) is necessary but not sufficient,
because the retry still reads before the write is visible.

**Next step:** inspect `withNeverOwnedWebPrivateGuestProvenance()` and
`establishNeverOwnedWebPrivateGuestProvenance()` for what they await and what
they report. The fix is to make the marker durably readable — and the scope's
return value honest — before adoption is retried, then re-run this exact trace
and confirm a third `guestState` line appears with
`legacyProvenanceMatches: true` followed by a successful adoption.

All `[bq-diag]` logging must be removed before merge. The diagnostic build is
`codex/fix-web-bootstrap-race` @ `69294de`.


## Correction — the retry change on the fix branch is based on a wrong model

`withNeverOwnedWebPrivateGuestProvenance()` is **self-sufficient**. Reading it
end to end:

    rotatePrivateWriteGeneration(storage)        // sets privateWriteGenerationInvalidated = true
    neverOwnedGuestProvenance = { generation, handle }
    if (!(await establish())) return false;      // <-- returns false here
    complete = <re-verify generation + guest state + cookie scrub>
    adoptedPrivateWriteGeneration = generation;
    adoptedPrivateReadAuthority = { generation, kind: "guest" };
    privateWriteGenerationInvalidated = false;   // clears its own rotation
    const hydrated = await coordinateCurrentWebPrivateJourney();
    return true;

It already performs the adoption, clears the invalidation it caused, and
coordinates hydration. The original code was therefore **correct** to assign its
result to `adopted`. The "retry adoption afterwards" change now on
`codex/fix-web-bootstrap-race` is built on a misreading and should be reverted:
a separate `adoptCurrentWebPrivateWriteGeneration()` call after this scope will
hit GATE A, because the scope rotates the generation and only clears the
invalidation on its own success path.

That also explains the third `adopt: enter` / `GATE A invalidated` line in the
trace — it is the retry firing after the scope rotated the generation.

**So the single remaining question is narrower than previously stated:** why does
`establishNeverOwnedWebPrivateGuestProvenance()` return false when it evidently
writes `biblequest:web-private:legacy-guest:v1 = never-owned`? It is gated by
`webPrivateNeverOwnedGuestProvenanceAllowed()`; note that the enclosing scope has
just set `privateWriteGenerationInvalidated = true` via
`rotatePrivateWriteGeneration()`, so any check that consults that flag — directly
or through `webPrivateReadAllowed()` — will refuse inside its own scope.

**Recommended next actions, in order:**

1. Revert the retry change on `codex/fix-web-bootstrap-race`, keeping only the
   verified `authStorageRead` fix, which is correct and independent.
2. Strip all `[bq-diag]` logging.
3. Instrument `establishNeverOwnedWebPrivateGuestProvenance()` and
   `webPrivateNeverOwnedGuestProvenanceAllowed()` and re-run the same trace to
   see which predicate refuses.


## Eliminated hypotheses (do not retrace)

- **Hydration.** `coordinateQuestOSWebPrivateHydration()` is never reached;
  instrumented and silent on every branch.
- **Circular owner read.** `readLocalJourneyOwner()` returns `unowned`
  correctly on a first visit; the namespace state is `legacy` and the selector
  returns the legacy key.
- **Cookie scrub.** `document.cookie` is empty on a first visit and
  `legacyStorageKey()` resolves from the inlined `NEXT_PUBLIC_SUPABASE_URL`.
- **Self-invalidating emptiness check.** `establishNeverOwnedWebPrivateGuestProvenance()`
  passes `LEGACY_GUEST_PROVENANCE_STORAGE_KEY` as `allowedKey` to its
  post-write `privateLocalStorageIsEmpty()` call, and that helper explicitly
  exempts the allowed key when its value is `never-owned`. Correct as written.
- **Missing adoption retry.** `withNeverOwnedWebPrivateGuestProvenance()`
  performs the adoption itself; adding a retry is wrong and was reverted.

**Remaining surface.** `establishNeverOwnedWebPrivateGuestProvenance()` returns
false somewhere in its pre-write conjunction, most plausibly through
`allowed()` = `webPrivateNeverOwnedGuestProvenanceAllowed()`, which requires all
of: a live `neverOwnedGuestProvenance` authority, `webAccountRealmAttested`, the
handle still in `activeAccountOperations`, the stored generation equal to the
authority's rotated generation, namespace `legacy`, envelope missing, and none
of the terminal/active/locked/installing reset flags set. Instrument those nine
conditions individually — that is a single pass and will name it outright.


## Narrowing, round 4 — final, two candidate expressions

Instrumented on a real deployment, first visit, empty storage, no service worker.

`webPrivateNeverOwnedGuestProvenanceAllowed()` — **all nine conjuncts true**:

    {"hasAuthority":true,"hasStorage":true,"attested":true,"handleLive":true,
     "generationMatches":true,"namespace":"legacy","envelope":"missing",
     "terminalCleanup":false,"activeReset":false,"lockedReset":false,
     "installingReset":false}

`establishNeverOwnedWebPrivateGuestProvenance()` — **all pre-write checks pass**:

    {"allowed1":true,"cutoverState":"none","namespace":"legacy",
     "localEmpty":true,"avatarsEmpty":true,"localEmpty2":true,"allowed2":true}

So execution reaches the marker write. Everything before it is correct. The
failure is therefore in exactly one of two places, both evaluated *after*
`storage.setItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY, WEB_PRIVATE_NEVER_OWNED_VALUE)`:

1. **`establish()`'s own return**

       return allowed() &&
         privateLocalStorageIsEmpty(storage, allowed, LEGACY_GUEST_PROVENANCE_STORAGE_KEY);

2. **the enclosing scope's `complete` verification** in
   `withNeverOwnedWebPrivateGuestProvenance()`

       readPrivateWriteGeneration(storage) === generation &&
       durableNeverOwnedGuestState(storage) &&
       scrubLegacyWebAuthCookies() &&
       durableNeverOwnedGuestState(storage)

Instrument those two expressions term by term — one pass, same pattern as
above — and the defect is named outright. Note that `durableNeverOwnedGuestState`
was previously observed returning false only while the marker was absent, which
it no longer is at these call sites; and `scrubLegacyWebAuthCookies()` has no
cookies to remove on a first visit but returns `legacyWebAuthCookiesAreAbsent()`,
which is worth confirming rather than assuming.

Diagnostic build carrying this instrumentation: `codex/fix-web-bootstrap-race`
@ `89b9ce2`. All `[bq-diag]` logging must be removed before merge; the clean
single-fix state of that branch is `e4dc08a`.


## ROOT CAUSE FOUND — `scrubLegacyWebAuthCookies()` fails on a first visit

Final instrumentation on a real deployment, first visit, empty storage:

    establishPost {"allowedAfterWrite":true,"emptyAfterWrite":true,
                   "markerValue":"never-owned"}
    scopeComplete {"hasStorage":true,"generationMatches":true,"guestBefore":true,
                   "scrubbed":false,"guestAfter":true}

`establish()` fully succeeds — the marker is written and verified. The guest
state is durable both before and after. **The single false term is
`scrubbed`.** `scrubLegacyWebAuthCookies()` returns false, so the scope's
`complete` verification fails, adoption is rolled back, and the visitor is sent
to the keep/clear gate.

`document.cookie` is `""` on this page, confirmed directly. Tracing the two
functions with that fact:

    scrubLegacyWebAuthCookies()
      -> storageKey = legacyStorageKey(); if (!storageKey) return false;
      -> parse("") yields {}, so no cookie is serialized away
      -> return legacyWebAuthCookiesAreAbsent()
           -> storageKey = legacyStorageKey(); if (!storageKey) return false;
           -> !Object.keys(parse("")).some(...) === true

With no cookies, the only path to `false` in either function is
`legacyStorageKey()` returning null. That function derives the legacy cookie
name from `process.env.NEXT_PUBLIC_SUPABASE_URL`:

    const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!origin) return null;
    const url = new URL(origin);
    const project = url.hostname.split(".")[0];
    return project ? `sb-${project}-auth-token` : null;

**So a device with no legacy cookies cannot complete guest adoption**, because a
helper whose only job is to remove cookies that do not exist reports failure.

### Fix direction

The correct behaviour is that having no legacy cookies is *success*, not
failure. Two candidate fixes, in order of preference:

1. Make absence explicit: when there are no legacy cookies to scrub, return
   true regardless of whether the legacy key name can be derived. A missing
   legacy key name means there is no legacy cookie namespace to clean, which is
   the same end state the caller requires.
2. If `legacyStorageKey()` is genuinely returning null on a deployed client,
   establish why `NEXT_PUBLIC_SUPABASE_URL` is not readable there and fix the
   access — but note the bundle demonstrably contains the origin, so option 1
   is the more likely correct change.

Confirm by instrumenting `legacyStorageKey()` once, then verify the whole flow
in a browser from empty storage: the expected result is `scrubbed:true`,
adoption succeeding, and `/app` rendering without the keep/clear gate.

Diagnostic build: `codex/fix-web-bootstrap-race` @ `1f742b9`. The clean
single-fix state of that branch is `e4dc08a`; all `[bq-diag]` logging must be
removed before merge.
