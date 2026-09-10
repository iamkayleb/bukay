<!-- base-branch: eval/claude -->
<!-- eval-round: 6 -->
<!-- eval-spec: availability-engine -->
<!-- eval-agent: claude -->

## Why

Slot computation is the highest-risk logic in the product and benefits from being pure and exhaustively tested.

## Scope

Pure function returning open slots from service, date range, existing bookings, hours, buffers, lead time and max advance.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/lib/availability.ts`: implement `computeSlots()`
- [ ] Add `app/lib/availability.ts`: handle duration, buffer, lead time and max-advance
- [ ] Add `__tests__/availability.test.ts`: add fixtures and edge cases
- [ ] Add `__tests__/availability.bench.ts`: add a 1000-booking benchmark

## Acceptance Criteria

- [ ] Branch coverage of `app/lib/availability.ts` is 95% or above, verified by `pnpm test`
- [ ] Every fixture in `__tests__/availability.test.ts` returns the expected slots
- [ ] The benchmark completes in under 50ms
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `claude` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/claude`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-06.json, spec `availability-engine`, agent `claude`.
```

</details>
