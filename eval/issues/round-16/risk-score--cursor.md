<!-- base-branch: eval/cursor -->
<!-- eval-round: 16 -->
<!-- eval-spec: risk-score -->
<!-- eval-agent: cursor -->

## Why

Turning no-show history into an automatic deposit requirement is the payoff for tracking it.

## Scope

Compute a client risk score and require deposits from high-risk clients, with per-tenant thresholds.

## Tasks

- [ ] Add `lib/risk.ts`: implement `computeRiskScore()`
- [ ] Add `prisma/schema.prisma`: add threshold columns to the `Tenant` model
- [ ] Add `app/api/public/bookings/route.ts`: enforce the deposit
- [ ] Add `tests/risk.test.ts` covering boundary cases

## Acceptance Criteria

- [ ] `computeRiskScore()` is deterministic for identical input, verified by `pnpm test`
- [ ] A high-risk booking without deposit returns HTTP 402
- [ ] An owner override in `app/(app)/calendar/page.tsx` bypasses the gate
- [ ] `pnpm test` passes
