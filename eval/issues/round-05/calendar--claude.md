<!-- base-branch: eval/claude -->
<!-- eval-round: 5 -->
<!-- eval-spec: calendar -->
<!-- eval-agent: claude -->

## Why

The calendar is the owner's primary daily surface for seeing and moving work.

## Scope

Day and week calendar views with click-to-edit and drag-to-reschedule.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/(app)/calendar/page.tsx`: build day and week views
- [ ] Add `components/CalendarGrid.tsx`: implement drag-and-drop
- [ ] Add `components/BookingEditModal.tsx`: build the edit modal
- [ ] Add `app/api/bookings/[id]/route.ts`: implement  with audit logging

## Acceptance Criteria

- [ ] A dragged booking persists its new time, verified by `pnpm test`
- [ ] An overlapping or out-of-hours drag reverts and returns HTTP 409
- [ ] The `AuditLog` row records both previous and new times
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `claude` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/claude`. Keep changes limited to the files named in Tasks.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-05.json, spec `calendar`, agent `claude`.
```

</details>
