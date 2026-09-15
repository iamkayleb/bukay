<!-- base-branch: eval/claude -->
<!-- eval-round: 17 -->
<!-- eval-spec: weekly-digest -->
<!-- eval-agent: claude -->

## Why

A weekly summary keeps the merchant engaged and surfaces problems they would not otherwise notice.

## Scope

Send the owner a weekly summary of bookings, revenue, no-shows, top service and one actionable insight.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

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

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 17 specification, spec weekly-digest, agent claude.
```

</details>
