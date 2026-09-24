<!-- base-branch: eval/cursor -->
<!-- eval-round: 9 -->
<!-- eval-spec: payout-ledger -->
<!-- eval-agent: cursor -->

## Why

Money movement must be auditable and reconcilable, which requires an append-only record.

## Scope

Immutable ledger of gross, provider fee, platform fee, net and direction, with a tenant payout dashboard.

**Allowed paths:**

- `app/(app)/payouts/**`
- `app/lib/**`
- `prisma/**`
- `scripts/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `LedgerEntry` model with an append-only trigger
- [ ] Add `app/lib/ledger.ts`: write a ledger entry on payment success
- [ ] Add `app/lib/ledger.ts`: write a ledger entry on refund
- [ ] Add `app/lib/ledger.ts`: write a ledger entry on payout
- [ ] Add `app/(app)/payouts/page.tsx`: build the dashboard with CSV export
- [ ] Add `scripts/reconcile.ts`: add the reconciliation job

## Acceptance Criteria

- [ ] Ledger totals match the provider statement to the kobo, verified by `pnpm test`
- [ ] An UPDATE or DELETE against `LedgerEntry` is rejected by the database
- [ ] CSV export returns HTTP 200 for any date range
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 9 specification, spec payout-ledger, agent cursor.
```

</details>
