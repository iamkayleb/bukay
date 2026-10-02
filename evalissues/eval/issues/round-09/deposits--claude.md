<!-- base-branch: eval/claude -->
<!-- eval-round: 9 -->
<!-- eval-spec: deposits -->
<!-- eval-agent: claude -->

## Why

Deposits are the merchant's main defence against no-shows and a core selling point.

## Scope

Per-service deposit as percentage or flat amount, with balance capture and no-show fees.

## Tasks

- [ ] Add `prisma/schema.prisma`: add deposit columns to the `Service` model
- [ ] Add `lib/payments/split.ts`: split deposit and balance records
- [ ] Add `app/api/payments/capture/route.ts`: implement
- [ ] Add `lib/payments/no-show.ts`: implement the no-show fee path

## Acceptance Criteria

- [ ] A deposit-only booking holds status `confirmed_partial`, verified by `pnpm test`
- [ ] Balance capture returns HTTP 200 and closes the booking
- [ ] The no-show fee writes a `LedgerEntry` row
- [ ] `pnpm test` passes
