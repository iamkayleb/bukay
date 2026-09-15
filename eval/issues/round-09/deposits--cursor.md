<!-- base-branch: eval/cursor -->
<!-- eval-round: 9 -->
<!-- eval-spec: deposits -->
<!-- eval-agent: cursor -->

## Why

Deposits are the merchant's main defence against no-shows and a core selling point.

## Scope

Per-service deposit as percentage or flat amount, with balance capture and no-show fees.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `prisma/schema.prisma`: add deposit columns to the `Service` model
- [ ] Add `app/lib/payments/split.ts`: write the deposit record
- [ ] Add `app/lib/payments/split.ts`: write the balance record
- [ ] Add `app/api/payments/capture/route.ts`: implement
- [ ] Add `app/lib/payments/no-show.ts`: implement the no-show fee path

## Acceptance Criteria

- [ ] A deposit-only booking holds status `confirmed_partial`, verified by `pnpm test`
- [ ] Balance capture returns HTTP 200 and closes the booking
- [ ] The no-show fee writes a `LedgerEntry` row
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 9 specification, spec deposits, agent cursor.
```

</details>
