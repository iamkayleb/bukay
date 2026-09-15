<!-- base-branch: eval/codex -->
<!-- eval-round: 17 -->
<!-- eval-spec: staff -->
<!-- eval-agent: codex -->

## Why

Multi-staff businesses are a large share of the target market and need per-staff calendars.

## Scope

Per-staff calendars, service eligibility and commission splits, with a staff picker in the public flow.

## Tasks

- [ ] Add `prisma/schema.prisma`: extend the `Staff` model with tenant scope
- [ ] Add `prisma/schema.prisma`: add the staff-service mapping table
- [ ] Add `app/[slug]/book/page.tsx`: add the picker
- [ ] Add `lib/ledger.ts`: apply commission splits

## Acceptance Criteria

- [ ] A staff session sees only its own bookings, verified by `pnpm test`
- [ ] Commission appears as a `LedgerEntry` row per booking
- [ ] An overlapping booking for one staff member returns HTTP 409
- [ ] `pnpm test` passes
