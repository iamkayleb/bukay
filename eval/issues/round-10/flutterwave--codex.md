<!-- base-branch: eval/codex -->
<!-- eval-round: 10 -->
<!-- eval-spec: flutterwave -->
<!-- eval-agent: codex -->

## Why

A second provider proves the payment port is a real abstraction and unblocks other markets.

## Scope

Second PaymentProvider implementation with tenant-level provider selection and shared contract tests.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/lib/payments/flutterwave.ts`: add the adapter
- [ ] Add `app/api/webhooks/flutterwave/route.ts`: implement  with signature checks
- [ ] Add `prisma/schema.prisma`: add the `paymentProvider` column to the `Tenant` model
- [ ] Add `__tests__/payment-contract.test.ts`: add the shared suite

## Acceptance Criteria

- [ ] Both adapters pass `__tests__/payment-contract.test.ts`, verified by `pnpm test`
- [ ] Switching provider preserves existing `LedgerEntry` rows
- [ ] Ledger writes from both adapters have identical shape
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-10.json, spec `flutterwave`, agent `codex`.
```

</details>
