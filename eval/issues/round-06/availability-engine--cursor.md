<!-- base-branch: eval/cursor -->
<!-- eval-round: 6 -->
<!-- eval-spec: availability-engine -->
<!-- eval-agent: cursor -->

## Why

Slot computation is the highest-risk logic in the product and benefits from being pure and exhaustively tested.

## Scope

Pure function returning open slots from service, date range, existing bookings, hours, buffers, lead time and max advance.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/lib/availability.ts`: implement `computeSlots()`
- [ ] Add `app/lib/availability.ts`: handle service duration plus buffer
- [ ] Add `app/lib/availability.ts`: handle lead time plus the max-advance window
- [ ] Add `__tests__/availability.test.ts`: add the slot fixtures
- [ ] Add `__tests__/availability.test.ts`: add the edge-case cases
- [ ] Add `__tests__/availability.bench.ts`: add a 1000-booking benchmark

## Acceptance Criteria

- [ ] Branch coverage of `app/lib/availability.ts` is 95% or above, verified by `pnpm test`
- [ ] Every fixture in `__tests__/availability.test.ts` returns the expected slots
- [ ] The benchmark completes in under 50ms
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 6 specification, spec availability-engine, agent cursor.
```

</details>
