<!-- base-branch: eval/claude -->
<!-- eval-round: 8 -->
<!-- eval-spec: paystack-charge -->
<!-- eval-agent: claude -->

## Why

Taking payment at booking time is what makes deposits and no-show protection possible.

## Scope

Initialize a transaction, redirect to checkout and verify on callback, with tenant subaccount splits.

## Non-Goals

Use `lib/payments/fake.ts` in tests. Live Paystack credentials must not be required for CI.

## Tasks

- [ ] Add `lib/payments/provider.ts`: define the `PaymentProvider` port
- [ ] Add `lib/payments/paystack.ts`: add the adapter and a fake in `lib/payments/fake.ts`
- [ ] Add `app/api/payments/verify/route.ts`: implement the callback
- [ ] Add `lib/payments/subaccount.ts`: create subaccounts during setup
- [ ] Add `lib/slot-hold.ts`: release held slots on failure

## Acceptance Criteria

- [ ] A test-mode payment moves the booking to `confirmed`, verified by `pnpm test`
- [ ] A failed payment releases the slot within 10 minutes
- [ ] The subaccount split matches the configured percentage
- [ ] No secret value appears in logs, verified by `pnpm test`
