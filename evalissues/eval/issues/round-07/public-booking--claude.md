<!-- base-branch: eval/claude -->
<!-- eval-round: 7 -->
<!-- eval-spec: public-booking -->
<!-- eval-agent: claude -->

## Why

This is the revenue path: without it the product has no customer-facing function.

## Scope

Multi-step booking at `/{slug}/book` creating a pending booking and holding the slot for 10 minutes.

## Tasks

- [ ] Add `app/[slug]/book/page.tsx`: build the stepper
- [ ] Add `lib/phone.ts`: validate Nigerian numbers with
- [ ] Add `lib/slot-hold.ts`: implement the hold with a 10-minute expiry
- [ ] Add `app/api/public/bookings/route.ts`: implement
- [ ] Add `tests/public-booking.test.ts` covering the full path

## Acceptance Criteria

- [ ] A completed flow creates a booking with status `pending_payment`, verified by `pnpm test`
- [ ] A second session requesting the held slot receives HTTP 409
- [ ] The hold releases after 10 minutes
- [ ] `pnpm test` passes
