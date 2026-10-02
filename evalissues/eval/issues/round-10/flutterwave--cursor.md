<!-- base-branch: eval/cursor -->
<!-- eval-round: 10 -->
<!-- eval-spec: flutterwave -->
<!-- eval-agent: cursor -->

## Why

A second provider proves the payment port is a real abstraction and unblocks other markets.

## Scope

Second PaymentProvider implementation with tenant-level provider selection and shared contract tests.

## Tasks

- [ ] Add `lib/payments/flutterwave.ts`: add the adapter
- [ ] Add `app/api/webhooks/flutterwave/route.ts`: implement  with signature checks
- [ ] Add `prisma/schema.prisma`: add the `paymentProvider` column to the `Tenant` model
- [ ] Add `tests/payment-contract.test.ts`: add the shared suite

## Acceptance Criteria

- [ ] Both adapters pass `tests/payment-contract.test.ts`, verified by `pnpm test`
- [ ] Switching provider preserves existing `LedgerEntry` rows
- [ ] Ledger writes from both adapters have identical shape
- [ ] `pnpm test` passes
