<!-- base-branch: eval/cursor -->
<!-- eval-round: 9 -->
<!-- eval-spec: payout-ledger -->
<!-- eval-agent: cursor -->

## Why

Money movement must be auditable and reconcilable, which requires an append-only record.

## Scope

Immutable ledger of gross, provider fee, platform fee, net and direction, with a tenant payout dashboard.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `LedgerEntry` model with an append-only trigger
- [ ] Add `lib/ledger.ts`: write entries from  on payment, refund and payout
- [ ] Add `app/(app)/payouts/page.tsx`: build the dashboard with CSV export
- [ ] Add `scripts/reconcile.ts`: add the reconciliation job

## Acceptance Criteria

- [ ] Ledger totals match the provider statement to the kobo, verified by `pnpm test`
- [ ] An UPDATE or DELETE against `LedgerEntry` is rejected by the database
- [ ] CSV export returns HTTP 200 for any date range
- [ ] `pnpm test` passes
