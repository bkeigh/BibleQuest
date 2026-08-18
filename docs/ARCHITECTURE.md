# BibleQuest architecture

The map of how the app is built, why the account/storage layer looks the way
it does, and where each kind of change belongs. Read this before touching
auth, storage, sync, or the platform boundary. Behavioural contracts live in
the per-topic docs this file links; process and release state live in the
runbooks.

Last verified against the source on 2026-08-14.

## The one constraint that explains everything else

BibleQuest is **local-first**: the client is the database. Prayers,
reflections, journey progress, drafts, and game state live in device storage
(web `localStorage`/IndexedDB, iOS Keychain + files) and remain fully usable
with no account and no network. Accounts and sync were added *after* that
foundation, which inverts the usual difficulty: sign-in is not a gate in front
of server data, it is a claim of **ownership over data the device already
holds**. Nearly all complexity in `src/lib/supabase`, `src/lib/storage`, and
`src/lib/auth` exists to answer one question safely:

> May this code, right now, read or write this owner's private data on this
> device — even while another tab, a BFCache-frozen page, a stale token
> refresh, or a concurrent sign-out is racing it?

The invariants that must never break:

1. User B must never observe a byte of user A's residue on a shared device.
2. Account deletion must genuinely purge — server rows, Storage objects, and
   every device store — and must be completable in-app (App Store 5.1.1(v)).
3. An ordinary network or token failure must never destroy offline guest data.
4. Entitlements (Plus) are decided by the server, never by client state.
5. Everything fails **closed**: missing, stale, or ambiguous state means "no".

## Layer map

```
UI screens (src/components/**)
  └─ hooks + orchestration (useSession, SyncManager, OnboardingGate)
       └─ domain libs (src/lib/{questos,games,rhythm,journal,avatar,push,…})
            └─ private storage boundary (src/lib/storage/*)        ← ownership
                 └─ auth core (src/lib/supabase/web-auth-storage.ts,
                               native-auth-storage.ts)             ← identity
                      └─ transport (src/lib/platform/api.ts, supabase clients)
                           └─ server (src/app/api/**, Supabase RLS + RPCs)
```

- **Domain libs** own feature logic and serialisation. They never talk to
  `localStorage` directly; they go through the private storage boundary.
- **The private storage boundary** (`src/lib/storage/`) enforces ownership on
  every private read/write/removal. `web-private-namespace.ts` is the
  declarative key registry (legacy → v2 pairs); `web-private-write.ts` is the
  guarded mutation path; `web-private-cutover.ts` migrates a device from
  legacy global keys to the owner-stamped v2 namespace exactly once.
- **The auth core** owns the session envelope, cross-tab locking, and the
  authority state machine described below. Web and native have separate
  implementations with the same conceptual contract.
- **Transport** (`src/lib/platform/api.ts`) exposes exactly three request
  shapes: `apiFetch` (public: cookies omitted, every account header
  stripped), `authenticatedApiFetch` (exact-subject bearer bound to a
  captured user id), and `accountDeletionAvatarFetch` (the single narrow
  deletion-cleanup exception). The iOS containment gate
  ([tests/ios-release-config.test.ts](../tests/ios-release-config.test.ts))
  pins these shapes.
- **The server** trusts only the verified bearer subject plus the
  `x-biblequest-expected-user` header match, and the database re-checks
  ownership via RLS and contract-shaped RPCs regardless of what the client
  claims. Migrations 0037/0038 add the native availability boundary and the
  deletion latch; `supabase/tests/` holds the pgTAP proofs.

## The authority concepts (read before adding any private-data feature)

Five overlapping mechanisms currently authorise private-data access. They are
all expressions of the ownership question above; consolidating them into one
explicit `AuthorityContext` is refactor phase **R2** (see below). Until then,
know what each is for:

| Concept | Lives in | Grants | Typical holder |
| --- | --- | --- | --- |
| **Account operation handle** (`withWebAccountOperationLock`) | web-auth-storage | The cross-tab exclusive right to run one account operation (install, sign-out, deletion, handoff) | Auth flows, SyncManager handoff |
| **Lifecycle handle** (`beginAccountLifecycle`) | auth/account-lifecycle | Marks a device-wide destructive lifecycle (deletion, A→B handoff) so concurrent account work refuses | useSession deletion path |
| **Write guard / removal guard** (`beginWebPrivateWrite`, `beginReviewedWebPrivateRemoval`) | web-auth-storage via web-private-write | The right to perform one synchronous private mutation under the adopted generation | Every domain-lib write |
| **Read lease** (`captureWebPrivateStorageReadLease`) | web-private-write | Proof that a mutation derives from a read of the same owner it is about to modify | Read-modify-write paths |
| **Generation + realm attestation** (`adoptCurrentWebPrivateWriteGeneration`, `requireCurrentWebAccountRealm`) | web-auth-storage | The standing right of this page/realm to touch the current owner's namespace at all; rotated on every auth transition | Established once per realm, checked by everything |

Interaction rules that hold today:

- Attestation (service worker v28 message channel) precedes adoption;
  adoption precedes any guard; a guard is only valid while its generation is
  still the adopted one. Any auth transition rotates the generation, which
  invalidates every outstanding guard and lease at once.
- Destructive flows (`start fresh`, deletion) run inside
  `withActiveWebPrivateWriteReset` / terminal cleanup scopes, which grant the
  *reviewed removal* authority that ordinary writes never receive.
- Failure at any step keeps the **old** owner marker and blocks sync, rather
  than relabelling residue for the new owner.

Test fixtures must establish real authority (seed envelope → attest → adopt)
rather than stubbing guards — see `tests/fixtures/web-auth.ts` and the
lessons recorded in commit `1a8b6ff`.

## Platform split (web vs native iOS)

The same product ships as a PWA and as a Capacitor iOS app with a static
bundle. The split is currently expressed as parallel implementations selected
by `isNativeTarget()`:

- session storage: `web-auth-storage.ts` (browser envelope + SW attestation)
  vs `native-auth-storage.ts` (Keychain, serialized queue, install marker);
- authenticated fetch: web branch adds the web-auth protocol header; native
  branch checks `ACCOUNT_SYNC_CONTAINED` and the remote beta availability
  latch **before** importing any Supabase client;
- build profiles (`scripts/build-native.mjs`): `ios:release:prepare` produces
  the guest App Store artifact (blank Supabase config, all account latches
  off); `ios:account-release:prepare` builds against the reviewed production
  manifest [config/ios-account-release.json](../config/ios-account-release.json)
  with its fingerprinted publishable key. The historical staging-beta profile
  (`ios:account-beta:prepare`, `config/ios-account-beta.json`) remains fail
  closed and is not a release path.

Unifying the parallel stacks behind one `AuthTransport`/`PrivateStorage` port
is refactor phase **R3**; the containment gate then moves from source regexes
to an import-graph boundary.

## Sync

`src/lib/sync/engine.ts` pulls, merges, and pushes the journey against
Supabase under these rules: per-request deadlines (never one global timeout),
bounded batches, server-authoritative baselines for revisioned rows, explicit
tombstones, and generation quarantine — a generation advance observed between
pull verification and push abandons the work instead of writing stale state.
Account handoff (`sync/handoff.ts`) applies the user's explicit keep/start-
fresh choice before the first sync; the local owner record (`sync/last-user.ts`)
is stamped only after the destructive part has provably completed. Reminders,
drafts, and game/Rhythm state are deliberately device-only even when sync is
on.

## Where things are

| Area | Entry points | Contract doc |
| --- | --- | --- |
| Journey store | `src/lib/questos/store.ts` | [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md) |
| Sync engine | `src/lib/sync/engine.ts` | [ACCOUNT_SYNC_RUNBOOK.md](ACCOUNT_SYNC_RUNBOOK.md) |
| Auth core (web) | `src/lib/supabase/web-auth-storage.ts` | this file |
| Auth core (native) | `src/lib/supabase/native-auth-storage.ts` | this file |
| Private storage | `src/lib/storage/` | this file |
| Session hook | `src/lib/supabase/useSession.ts` | this file |
| Transport | `src/lib/platform/api.ts` | this file |
| Server routes | `src/app/api/**` | [OBSERVABILITY.md](OBSERVABILITY.md), [EMBED_SECURITY.md](EMBED_SECURITY.md) |
| Database | `supabase/migrations/`, `supabase/tests/` | [SUPABASE_SECURITY_ROLLOUT.md](SUPABASE_SECURITY_ROLLOUT.md) |
| Billing | `src/lib/billing/`, `src/lib/support/` | [STRIPE_TEST_BILLING.md](STRIPE_TEST_BILLING.md), [STRIPE_ONE_TIME_SUPPORT.md](STRIPE_ONE_TIME_SUPPORT.md) |
| Offline worker | `public/sw.js` (v28) | [DEPLOYMENT.md](DEPLOYMENT.md) |
| iOS release | `ios/`, `scripts/build-native.mjs` | [IOS_TESTFLIGHT_RUNBOOK.md](IOS_TESTFLIGHT_RUNBOOK.md), [IOS_ACCOUNT_REPLACEMENT_RELEASE.md](IOS_ACCOUNT_REPLACEMENT_RELEASE.md) |

Historical plans and superseded handoffs live in [archive/](archive/).

## Known structural debt and the agreed refactor sequence

Accepted on 2026-08-14, deferred until after the account release ships
(refactoring the release branch reopens its exact-head proofs):

- **R2 — decompose the auth core.** `web-auth-storage.ts` is ~3,250 lines
  with 17 module-level mutable variables forming an implicit state machine.
  Split into codec → storage surface → locking → attestation → a single
  explicit `AuthorityContext` (replacing the five concepts above) → session
  lifecycle. Behaviour-preserving, gated by the full suite.
- **R3 — platform port.** One `AuthTransport`/`PrivateStorage` interface,
  native and web adapters, containment asserted on the import graph.
- **R4 — declarative storage registry.** One table of
  `{domain, legacyKey, v2Key, removalPolicy}` driving cutover, purge, and
  boundary membership; delete the parallel constant lists.
- **R5 — slim the god-screens.** Extract deletion/handoff orchestration from
  `SettingsScreen` (~2,050 lines), `OnboardingGate`, and `SyncManager` into
  lib hooks, per-screen as each next needs changes.

Also parked for R2+: consolidating the nine `reconcile-production-*.mjs`
scripts behind one parameterized CLI (their contents are pinned by evidence
tests, so this is not a docs-only change).

Rules while the debt stands: no new module-level mutable state in the auth
core; new private keys enter `web-private-namespace.ts` as legacy/v2 pairs,
never as ad-hoc strings; every new invariant assertion gets mutation-tested
(break the code, watch the exact assertion fail) before it counts as
coverage.
