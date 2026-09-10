<!-- base-branch: eval/cursor -->
<!-- eval-round: 17 -->
<!-- eval-spec: staff -->
<!-- eval-agent: cursor -->

## Why

Multi-staff businesses are a large share of the target market and need per-staff calendars.

## Scope

Per-staff calendars, service eligibility and commission splits, with a staff picker in the public flow.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

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

Seeded for the `cursor` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/cursor`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-17.json, spec `staff`, agent `cursor`.
```

</details>
