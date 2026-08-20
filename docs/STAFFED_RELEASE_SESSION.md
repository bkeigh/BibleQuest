# Archive — pre-migration staffed release session

> **Do not execute this checklist.** It records the earlier `cb8f97e` /
> schema-`0036` rollout that applied `0038`, merged the web work, and then
> applied `0037`. Production is recorded on 2026-08-20 at `9680ff7`, schema
> contract `0038`, with native availability off. Replaying sections 1–6 would
> repeat completed database and deployment work. Use
> [`IOS_ACCOUNT_REPLACEMENT_RELEASE.md`](IOS_ACCOUNT_REPLACEMENT_RELEASE.md)
> sections 4 and 6 for current source/device gates and
> [`IOS_ACCOUNT_CI_WORKFLOW.md`](IOS_ACCOUNT_CI_WORKFLOW.md) for the Xcode Cloud
> path. Every external action still needs Brendan’s fresh approval.

This file recorded what the account release still needed before the migrations
shipped. Each historical step named what had to be true and what to record; it
is retained for audit context only.

**Never record** an email code, access token, publishable-key input,
service-role key, database URL, private writing, or a real user identifier in
this file, a ticket, chat, or a screenshot. Record only outcomes, timestamps,
build identifiers, and counts.

## Where things stand before you begin

| Item | State |
| --- | --- |
| Frozen candidate | `cb8f97e` — CI green, suite 179 files / 1,446 tests |
| Staged web artifact | Unpromoted Production-environment deployment; identity, bundle, headers, and native-CORS gates all pass |
| Customer domains | `www`, apex, `console` on `ed28b0b` / schema 0036 / worker v26 — unchanged |
| Production database | Schema 0036. Neither 0037 nor 0038 applied |
| `0038` dry run | **Passes.** Production pinned, one-packet proposal, `applied:false` |
| `0037` dry run | **Correctly refuses** until 0038 is applied — its reviewed history ends with 0038's packet |
| Rollback artifact | `codex/v2-containment-rollback`, staged and rehearsed |

## The ordering that matters

`0038` is a database-first change and **must be applied before** the account
deletion regression can pass. Before `0038`, the deletion path is *designed* to
fail closed — a failed deletion attempt at that point is the correct result,
not a bug. `0037` comes last and its own guard will not let you run it early.

    stage artifact → prove fail-closed → apply 0038 → deletion regression
      → merge → new main artifact → rebind domains → apply 0037 → iOS build

## 1. Two disposable accounts

Create two accounts you are willing to destroy, on addresses that are not
personal. Call them A and B in every note. Never write the addresses down.

## 2. Prove the deletion path fails closed (before 0038)

On the staged artifact, with A signed in, attempt in-app account deletion.

- [ ] Deletion refuses cleanly, with a stated reason and no partial data loss.
- [ ] A's journey, prayers, and reflections are still intact afterwards.
- [ ] Record: build identifier, UTC, outcome.

## 3. Apply migration 0038

Requires the database owner's and rollback authority's approval for this exact
mutation. Re-run the dry run immediately before applying — the backup must be
under 30 hours old **at apply time**, so re-check rather than trusting an
earlier reading.

```bash
pnpm check:production-web-account-deletion
```

- [ ] Dry run passes; `applied:false`; proposal is exactly the one packet.
- [ ] Backup age under 30 hours, re-read at this moment.
- [ ] Approval recorded with full name and UTC.
- [ ] Apply, then confirm production history is `…0036, 0038` and that `0037`
      is still absent.

## 4. The deletion and isolation regression

On the staged artifact, after 0038 is applied.

- [ ] **B's own restore.** Sign in as B on a clean browser profile; B's own
      collections restore; nothing of A's appears anywhere.
- [ ] **Two-way isolation.** With A and B signed in on separate profiles,
      neither can read or mutate the other's rows — including guided
      movements and avatars.
- [ ] **In-app deletion retry.** Delete A in-app on the fixed artifact. It
      completes, including the avatar sweep that failed previously.
- [ ] **Zero residue.** After deletion, A's identity and rows are gone; B is
      untouched. Record counts only, never identifiers.
- [ ] **Ordinary-failure safety.** A network error mid-deletion must not
      destroy offline data.

## 5. Manual BFCache pass on the rollback artifact

Automation could not prove this: a CDP-attached browser disables BFCache, so
the back/forward test re-executed the bundle instead of restoring a frozen
heap. Do this by hand on **Safari and Chrome**, on the containment deployment.

1. Open `/app` on a profile with no `biblequest:web-private:` keys; let it settle.
2. Navigate away in the same tab to another origin.
3. In a second tab on the same origin, set
   `localStorage["biblequest:web-private:namespace:v2"] = "complete"`.
4. Press Back.

- [ ] The restored page shows the containment screen.
- [ ] `localStorage["biblequest:v1"]` is byte-identical afterwards.
- [ ] Record browser and version for each pass.

## 6. Merge, rebind, and 0037

- [ ] Named approvals recorded: release commander, deploy, database, QA,
      privacy, monitoring, App Store, rollback authority.
- [ ] Mark PR #106 ready; merge after protected checks pass.
- [ ] Wait for an unpromoted Production-environment deployment built from the
      new exact `main` SHA — **build it from a normal clone, never from a git
      worktree**, or the release identity cannot be derived and the readiness
      check will reject it.
- [ ] Repeat the critical checks on that artifact, then rebind customer
      domains to it. Never promote a branch/preview deployment.
- [ ] Apply `0037` (its dry run will pass once 0038 is in), leaving the
      availability flag **off**. Confirm the flag is off after applying.
- [ ] Merge the follow-up hygiene PR #108.

## 7. iOS account build

Only after the web release is live and 0037 is applied with its flag off.

- [ ] `pnpm ios:account-release:prepare`, audit the synced payload, archive.
- [ ] TestFlight, then the two-physical-iPhone matrix in
      [`IOS_ACCOUNT_REPLACEMENT_RELEASE.md`](IOS_ACCOUNT_REPLACEMENT_RELEASE.md) §6.
- [ ] Privacy answers, review notes, submission.

## If something fails

Stop at that step. Before any client has cut over to the v2 namespace, the
rollback is exact `ed28b0b`. **After** any client may have cut over, roll back
to the containment artifact instead — see
`docs/V2_CONTAINMENT_ROLLBACK.md` on the `codex/v2-containment-rollback` branch. Rolling back to exact `ed28b0b`
after cutover lets a legacy page overwrite migrated private data.
