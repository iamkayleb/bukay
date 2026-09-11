<!-- base-branch: eval/codex -->
<!-- eval-round: 7 -->
<!-- eval-spec: public-booking -->
<!-- eval-agent: codex -->

## Why

This is the revenue path: without it the product has no customer-facing function.

## Scope

Multi-step booking at `/{slug}/book` creating a pending booking and holding the slot for 10 minutes.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/[slug]/book/page.tsx`: build the stepper
- [ ] Add `app/lib/phone.ts`: validate Nigerian numbers with
- [ ] Add `app/lib/slot-hold.ts`: implement the hold with a 10-minute expiry
- [ ] Add `app/api/public/bookings/route.ts`: implement
- [ ] Add `__tests__/public-booking.test.ts` covering the full path

## Acceptance Criteria

- [ ] A completed flow creates a booking with status `pending_payment`, verified by `pnpm test`
- [ ] A second session requesting the held slot receives HTTP 409
- [ ] The hold releases after 10 minutes
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 7 specification, spec public-booking, agent codex.
```

</details>
