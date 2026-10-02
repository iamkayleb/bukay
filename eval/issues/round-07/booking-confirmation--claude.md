<!-- base-branch: eval/claude -->
<!-- eval-round: 7 -->
<!-- eval-spec: booking-confirmation -->
<!-- eval-agent: claude -->

## Why

Customers need proof of booking, and the domain event is the seam later notification work plugs into.

## Scope

Confirmation screen with an `.ics` download and signed reschedule and cancel links.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/[slug]/book/confirmed/page.tsx`: build the page
- [ ] Add `app/lib/ics.ts`: generate the calendar file
- [ ] Add `app/lib/tokens.ts`: sign 30-day tokens
- [ ] Add `app/lib/events.ts`: emit `booking.confirmed` from

## Acceptance Criteria

- [ ] The generated file from `app/lib/ics.ts` imports into Google Calendar, verified by `pnpm test`
- [ ] A tampered token returns HTTP 400
- [ ] An expired token returns HTTP 410
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 7 specification, spec booking-confirmation, agent claude.
```

</details>
