<!-- base-branch: eval/claude -->
<!-- eval-round: 4 -->
<!-- eval-spec: business-hours -->
<!-- eval-agent: claude -->

## Why

The availability engine cannot compute slots without a source of truth for opening times.

## Scope

Per-tenant weekly schedule with multiple windows per weekday, plus date-specific overrides.

## Tasks

- [ ] Add `prisma/schema.prisma`: add `BusinessHour` and `Blackout` models
- [ ] Add `app/(app)/settings/hours/page.tsx`: build the schedule editor
- [ ] Add `lib/hours.ts`: implement `getOpenWindows()`
- [ ] Add `tests/hours.test.ts` covering multi-window days and blackouts

## Acceptance Criteria

- [ ] Different hours per weekday persist and are verified by `pnpm test`
- [ ] A blackout date causes `getOpenWindows()` to return an empty array
- [ ] `lib/hours.ts` exports `getOpenWindows` for the availability engine
- [ ] `pnpm test` passes
