<!-- base-branch: eval/cursor -->
<!-- eval-round: 4 -->
<!-- eval-spec: manual-booking -->
<!-- eval-agent: cursor -->

## Why

Owners record walk-ins from day one, and it forces the double-booking constraint early.

## Scope

Owner adds a booking from the dashboard, choosing or creating a client. A database constraint prevents overlaps.

## Tasks

- [ ] Add `prisma/migrations/`: add a Postgres exclusion constraint on `(staffId, tstzrange)`
- [ ] Add `app/(app)/bookings/new/page.tsx`: build the booking form
- [ ] Add `app/api/bookings/manual/route.ts`: implement
- [ ] Add `lib/audit.ts`: write an `AuditLog` row on create

## Acceptance Criteria

- [ ] An overlapping booking for the same staff is rejected, verified by `pnpm test`
- [ ] The created booking appears in `/app/calendar` on reload
- [ ] An `AuditLog` row records `manual_booking_created`
- [ ] `pnpm test` passes
