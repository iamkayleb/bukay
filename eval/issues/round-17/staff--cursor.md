<!-- base-branch: eval/cursor -->
<!-- eval-round: 17 -->
<!-- eval-spec: staff -->
<!-- eval-agent: cursor -->

## Why

Multi-staff businesses are a large share of the target market and need per-staff calendars.

## Scope

Per-staff calendars, service eligibility and commission splits, with a staff picker in the public flow.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `prisma/schema.prisma`: extend the `Staff` model with tenant scope
- [ ] Add `prisma/schema.prisma`: add the staff-service mapping table
- [ ] Add `app/[slug]/book/page.tsx`: add the picker
- [ ] Add `app/lib/ledger.ts`: apply commission splits

## Acceptance Criteria

- [ ] A staff session sees only its own bookings, verified by `pnpm test`
- [ ] Commission appears as a `LedgerEntry` row per booking
- [ ] An overlapping booking for one staff member returns HTTP 409
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 17 specification, spec staff, agent cursor.
```

</details>
