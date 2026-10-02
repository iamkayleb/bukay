<!-- base-branch: eval/claude -->
<!-- eval-round: 17 -->
<!-- eval-spec: staff -->
<!-- eval-agent: claude -->

## Why

Multi-staff businesses are a large share of the target market and need per-staff calendars.

## Scope

Per-staff calendars, service eligibility and commission splits, with a staff picker in the public flow.

**Allowed paths:**

- `app/[slug]/book/**`
- `app/lib/**`
- `prisma/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

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

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 17 specification, spec staff, agent claude.
```

</details>
