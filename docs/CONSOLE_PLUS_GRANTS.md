# Console Plus grants

BibleQuest Console can grant Plus to a specific account without creating or
editing a Stripe subscription. The entitlement source is always visible as
`Stripe`, `Operator`, or `Free`.

## Safety contract

- Only a verified email in `BIBLEQUEST_CONSOLE_ALLOWED_EMAILS` can reach the
  Server Actions.
- Grant requires an exact account email, the same email typed again, one of
  `7d`, `30d`, `365d`, or `lifetime`, and a bounded internal reason.
- Revoke requires an exact account email, a fresh server-side identity lookup,
  the same email typed again, and a bounded reason.
- The database validates the operator UUID/email pair and locks the target
  account before mutation.
- Grant or revoke and its `console_audit_logs` event commit in one transaction.
- Browser roles cannot read the grant table or execute either mutation RPC.
- Service-role code can read grant state but cannot write the table directly.
- Manual revoke never edits or cancels an active Stripe entitlement.
- Expired and superseded rows remain as server-only history.

## Operator workflow

1. Sign in at `https://console.biblequest.co`.
2. Open **Accounts**.
3. Enter the member's exact BibleQuest account email.
4. Choose the access window and write a short internal reason.
5. Retype the exact email and submit.
6. Search the same exact email to verify the `Operator entitlement` label and
   expiry.
7. Open **Audit** to verify `entitlement · plus grant`.

To end manual access, expand **Revoke Plus for developer testing** directly
under the grant form, enter the exact account email and reason, retype the
email, and submit. Use this control sparingly for developer testing or
exceptional manual-access cleanup. If the account also has active Stripe
access, the member remains Plus through Stripe.

## Production migration

Migration `0030_operator_plus_grants.sql` is deployed only through the isolated
forward-only packet:

```sh
pnpm check:production-operator-plus
BIBLEQUEST_PRODUCTION_MIGRATION_CONFIRM="apply 20260728203000 to iacnjqnssovaaojswjoh" \
  node scripts/reconcile-production-operator-plus-grants.mjs --apply
```

The script pins the production project, the exact prior migration history, the
0030 SHA-256, one fresh completed physical backup, and the single proposed
packet. It never uses `db push --include-all`.

After apply, run the full production readiness command and the sanitized RLS
catalog report before promoting the application release.
