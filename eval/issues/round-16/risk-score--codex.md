<!-- base-branch: eval/codex -->
<!-- eval-round: 16 -->
<!-- eval-spec: risk-score -->
<!-- eval-agent: codex -->

## Why

Turning no-show history into an automatic deposit requirement is the payoff for tracking it.

## Scope

Compute a client risk score and require deposits from high-risk clients, with per-tenant thresholds.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/lib/risk.ts`: implement `computeRiskScore()`
- [ ] Add `prisma/schema.prisma`: add threshold columns to the `Tenant` model
- [ ] Add `app/api/public/bookings/route.ts`: enforce the deposit
- [ ] Add `__tests__/risk.test.ts` covering boundary cases

## Acceptance Criteria

- [ ] `computeRiskScore()` is deterministic for identical input, verified by `pnpm test`
- [ ] A high-risk booking without deposit returns HTTP 402
- [ ] An owner override in `app/(app)/calendar/page.tsx` bypasses the gate
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 16 specification, spec risk-score, agent codex.
```

</details>
