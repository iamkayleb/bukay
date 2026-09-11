<!-- base-branch: eval/cursor -->
<!-- eval-round: 8 -->
<!-- eval-spec: paystack-webhooks -->
<!-- eval-agent: cursor -->

## Why

Payment state must converge even when the customer closes the tab, which only webhooks guarantee.

## Scope

Handle charge.success, charge.failed and refund.processed with signature verification and idempotency.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/api/webhooks/paystack/route.ts`: implement
- [ ] Add `app/lib/payments/signature.ts`: verify HMAC signatures
- [ ] Add `app/lib/idempotency.ts`: add the idempotency store with a 7-day TTL
- [ ] Add `prisma/schema.prisma`: route unknown events to a dead letter table

## Acceptance Criteria

- [ ] A mismatched signature returns HTTP 401
- [ ] A replayed event produces no state change, verified by `pnpm test`
- [ ] All three event types update booking and payment state
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 8 specification, spec paystack-webhooks, agent cursor.
```

</details>
