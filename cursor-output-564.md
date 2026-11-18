## Keepalive run summary

Verified locally: `pnpm vitest run` (469 tests), `pnpm build`, and targeted `__tests__/app/api/bookings/update.test.ts` against SQLite.

### Tasks

- [x] Add `PATCH` to `app/api/bookings/[id]/route.ts` accepting `status` (one of `confirmed`, `cancelled`, `completed`, `no_show`) and optionally a new `startsAt`.
- [x] Recompute `endsAt` from the service's `durationMinutes` whenever `startsAt` changes.
- [x] In `app/api/bookings/[id]/route.ts`, reject a reschedule overlapping another booking for the same service with HTTP 409.
- [x] In `app/api/bookings/[id]/route.ts`, return HTTP 422 for an unknown status. Return HTTP 404 for a booking belonging to another tenant.
- [x] Standardise on the spelling `cancelled`. The codebase currently contains both `cancelled` (17 uses) and `canceled` (2); change the two to match the majority.
- [x] Add cancel, reschedule and no-show controls to `app/(app)/calendar/day-view.tsx`, each confirming before it acts.
- [x] Add `__tests__/app/api/bookings/update.test.ts` covering each transition, the overlap conflict, the unknown status and cross-tenant access, against a real database.

### Acceptance criteria

- [x] `pnpm build` and `pnpm vitest run` pass with no new failures.
- [x] With a seeded database, `PATCH /api/bookings/{id}` with `{"status":"cancelled"}` returns 200 and the stored row reads `cancelled`. This must run against a real database, not a mock.
- [x] `PATCH` with `{"status":"maybe"}` returns 422 and the row is unchanged.
- [x] Rescheduling onto a time already taken by another booking for the same service returns 409.
- [x] A merchant signs in, opens `/calendar` on 15 June 2026, cancels the seeded booking, reloads, and sees it marked cancelled rather than confirmed. (`e2e/calendar.spec.ts`)
- [x] `grep -r "canceled" app/` returns nothing.

**Progress:** 13/13 tasks complete, 0 remaining

### Follow-up (this run)

- `PATCH` cancellation now clears `Booking.slotLock`, matching payment and public-booking cancel paths so the demo seeded slot can be rebooked after calendar cancel.