<!-- base-branch: eval/claude -->
<!-- eval-round: 8 -->
<!-- eval-spec: paystack-webhooks -->
<!-- eval-agent: claude -->

## Why

Payment state must converge even when the customer closes the tab, which only webhooks guarantee.

## Scope

Handle charge.success, charge.failed and refund.processed with signature verification and idempotency.

## Tasks

- [ ] Add `app/api/webhooks/paystack/route.ts`: implement
- [ ] Add `lib/payments/signature.ts`: verify HMAC signatures
- [ ] Add `lib/idempotency.ts`: add the idempotency store with a 7-day TTL
- [ ] Add `prisma/schema.prisma`: route unknown events to a dead letter table

## Acceptance Criteria

- [ ] A mismatched signature returns HTTP 401
- [ ] A replayed event produces no state change, verified by `pnpm test`
- [ ] All three event types update booking and payment state
- [ ] `pnpm test` passes
