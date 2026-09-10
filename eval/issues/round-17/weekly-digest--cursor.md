<!-- base-branch: eval/cursor -->
<!-- eval-round: 17 -->
<!-- eval-spec: weekly-digest -->
<!-- eval-agent: cursor -->

## Why

A weekly summary keeps the merchant engaged and surfaces problems they would not otherwise notice.

## Scope

Send the owner a weekly summary of bookings, revenue, no-shows, top service and one actionable insight.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `scripts/digest-cron.ts`: add the job scheduled per tenant timezone
- [ ] Add `app/lib/digest.ts`: implement aggregation
- [ ] Add `app/lib/insights.ts`: implement the insight rules
- [ ] Add `__tests__/digest.test.ts` with fixtures

## Acceptance Criteria

- [ ] Every active tenant receives one digest per week, verified by `pnpm test`
- [ ] Digest figures match `/app/payouts` for the same period
- [ ] `app/lib/insights.ts` returns one actionable item per tenant
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `cursor` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/cursor`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-17.json, spec `weekly-digest`, agent `cursor`.
```

</details>
