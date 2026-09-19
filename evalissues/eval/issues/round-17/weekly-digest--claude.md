<!-- base-branch: eval/claude -->
<!-- eval-round: 17 -->
<!-- eval-spec: weekly-digest -->
<!-- eval-agent: claude -->

## Why

A weekly summary keeps the merchant engaged and surfaces problems they would not otherwise notice.

## Scope

Send the owner a weekly summary of bookings, revenue, no-shows, top service and one actionable insight.

## Tasks

- [ ] Add `scripts/digest-cron.ts`: add the job scheduled per tenant timezone
- [ ] Add `lib/digest.ts`: implement aggregation
- [ ] Add `lib/insights.ts`: implement the insight rules
- [ ] Add `tests/digest.test.ts` with fixtures

## Acceptance Criteria

- [ ] Every active tenant receives one digest per week, verified by `pnpm test`
- [ ] Digest figures match `/app/payouts` for the same period
- [ ] `lib/insights.ts` returns one actionable item per tenant
- [ ] `pnpm test` passes
