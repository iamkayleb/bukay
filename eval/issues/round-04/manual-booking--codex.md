<!-- base-branch: eval/codex -->
<!-- eval-round: 4 -->
<!-- eval-spec: manual-booking -->
<!-- eval-agent: codex -->

## Why

Owners record walk-ins from day one, and it forces the double-booking constraint early.

## Scope

Owner adds a booking from the dashboard, choosing or creating a client. A database constraint prevents overlaps.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

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

## Implementation Notes

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-04.json, spec `manual-booking`, agent `codex`.
```

</details>
