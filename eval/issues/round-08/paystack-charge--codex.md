<!-- base-branch: eval/codex -->
<!-- eval-round: 8 -->
<!-- eval-spec: paystack-charge -->
<!-- eval-agent: codex -->

## Why

Taking payment at booking time is what makes deposits and no-show protection possible.

## Scope

Initialize a transaction, redirect to checkout and verify on callback, with tenant subaccount splits.

**Allowed paths:**

- `app/api/payments/verify/**`
- `app/lib/**`
- `app/lib/payments/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Use `app/lib/payments/fake.ts` in tests. Live Paystack credentials must not be required for CI.

## Tasks

- [ ] Add `app/lib/payments/provider.ts`: define the `PaymentProvider` port
- [ ] Add `app/lib/payments/paystack.ts`: implement the live adapter
- [ ] Add `app/lib/payments/fake.ts`: implement the test double
- [ ] Add `app/api/payments/verify/route.ts`: implement the callback
- [ ] Add `app/lib/payments/subaccount.ts`: create subaccounts during setup
- [ ] Add `app/lib/slot-hold.ts`: release held slots on failure

## Acceptance Criteria

- [ ] A test-mode payment moves the booking to `confirmed`, verified by `pnpm test`
- [ ] A failed payment releases the slot within 10 minutes
- [ ] The subaccount split matches the configured percentage
- [ ] No secret value appears in logs, verified by `pnpm test`

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 8 specification, spec paystack-charge, agent codex.
```

</details>
