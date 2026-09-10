<!-- base-branch: eval/codex -->
<!-- eval-round: 7 -->
<!-- eval-spec: booking-confirmation -->
<!-- eval-agent: codex -->

## Why

Customers need proof of booking, and the domain event is the seam later notification work plugs into.

## Scope

Confirmation screen with an `.ics` download and signed reschedule and cancel links.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

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

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-07.json, spec `booking-confirmation`, agent `codex`.
```

</details>
