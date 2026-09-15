<!-- base-branch: eval/codex -->
<!-- eval-round: 7 -->
<!-- eval-spec: booking-confirmation -->
<!-- eval-agent: codex -->

## Why

Customers need proof of booking, and the domain event is the seam later notification work plugs into.

## Scope

Confirmation screen with an `.ics` download and signed reschedule and cancel links.

## Tasks

- [ ] Add `app/[slug]/book/confirmed/page.tsx`: build the page
- [ ] Add `lib/ics.ts`: generate the calendar file
- [ ] Add `lib/tokens.ts`: sign 30-day tokens
- [ ] Add `lib/events.ts`: emit `booking.confirmed` from

## Acceptance Criteria

- [ ] The generated file from `lib/ics.ts` imports into Google Calendar, verified by `pnpm test`
- [ ] A tampered token returns HTTP 400
- [ ] An expired token returns HTTP 410
- [ ] `pnpm test` passes
