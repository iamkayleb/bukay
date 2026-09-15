<!-- base-branch: eval/cursor -->
<!-- eval-round: 8 -->
<!-- eval-spec: paystack-charge -->
<!-- eval-agent: cursor -->

## Why

Taking payment at booking time is what makes deposits and no-show protection possible.

## Scope

Initialize a transaction, redirect to checkout and verify on callback, with tenant subaccount splits.

## Non-Goals

Use `app/lib/payments/fake.ts` in tests. Live Paystack credentials must not be required for CI.

## Tasks

- [ ] Add `app/lib/payments/provider.ts`: define the `PaymentProvider` port
- [ ] Add `app/lib/payments/paystack.ts`: add the adapter and a fake in `app/lib/payments/fake.ts`
- [ ] Add `app/api/payments/verify/route.ts`: implement the callback
- [ ] Add `app/lib/payments/subaccount.ts`: create subaccounts during setup
- [ ] Add `app/lib/slot-hold.ts`: release held slots on failure

## Acceptance Criteria

- [ ] A test-mode payment moves the booking to `confirmed`, verified by `pnpm test`
- [ ] A failed payment releases the slot within 10 minutes
- [ ] The subaccount split matches the configured percentage
- [ ] No secret value appears in logs, verified by `pnpm test`

## Implementation Notes

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 8 specification, spec paystack-charge, agent cursor.
```

</details>
