<!-- base-branch: eval/codex -->
<!-- eval-round: 6 -->
<!-- eval-spec: availability-engine -->
<!-- eval-agent: codex -->

## Why

Slot computation is the highest-risk logic in the product and benefits from being pure and exhaustively tested.

## Scope

Pure function returning open slots from service, date range, existing bookings, hours, buffers, lead time and max advance.

## Tasks

- [ ] Add `lib/availability.ts`: implement `computeSlots()`
- [ ] Add `lib/availability.ts`: handle duration, buffer, lead time and max-advance
- [ ] Add `tests/availability.test.ts`: add fixtures and edge cases
- [ ] Add `tests/availability.bench.ts`: add a 1000-booking benchmark

## Acceptance Criteria

- [ ] Branch coverage of `lib/availability.ts` is 95% or above, verified by `pnpm test`
- [ ] Every fixture in `tests/availability.test.ts` returns the expected slots
- [ ] The benchmark completes in under 50ms
- [ ] `pnpm test` passes
