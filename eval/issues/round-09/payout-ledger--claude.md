<!-- base-branch: eval/claude -->
<!-- eval-round: 9 -->
<!-- eval-spec: payout-ledger -->
<!-- eval-agent: claude -->

## Why

Money movement must be auditable and reconcilable, which requires an append-only record.

## Scope

Immutable ledger of gross, provider fee, platform fee, net and direction, with a tenant payout dashboard.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `LedgerEntry` model with an append-only trigger
- [ ] Add `app/lib/ledger.ts`: write entries from  on payment, refund and payout
- [ ] Add `app/(app)/payouts/page.tsx`: build the dashboard with CSV export
- [ ] Add `scripts/reconcile.ts`: add the reconciliation job

## Acceptance Criteria

- [ ] Ledger totals match the provider statement to the kobo, verified by `pnpm test`
- [ ] An UPDATE or DELETE against `LedgerEntry` is rejected by the database
- [ ] CSV export returns HTTP 200 for any date range
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `claude` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/claude`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-09.json, spec `payout-ledger`, agent `claude`.
```

</details>
