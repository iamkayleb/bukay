<!-- base-branch: eval/codex -->
<!-- eval-round: 9 -->
<!-- eval-spec: payout-ledger -->
<!-- eval-agent: codex -->

## Why

Money movement must be auditable and reconcilable, which requires an append-only record.

## Scope

Immutable ledger of gross, provider fee, platform fee, net and direction, with a tenant payout dashboard.

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

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 9 specification, spec payout-ledger, agent codex.
```

</details>
