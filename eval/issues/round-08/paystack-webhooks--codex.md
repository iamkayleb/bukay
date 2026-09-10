<!-- base-branch: eval/codex -->
<!-- eval-round: 8 -->
<!-- eval-spec: paystack-webhooks -->
<!-- eval-agent: codex -->

## Why

Payment state must converge even when the customer closes the tab, which only webhooks guarantee.

## Scope

Handle charge.success, charge.failed and refund.processed with signature verification and idempotency.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

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

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-08.json, spec `paystack-webhooks`, agent `codex`.
```

</details>
