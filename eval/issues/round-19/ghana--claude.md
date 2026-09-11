<!-- base-branch: eval/claude -->
<!-- eval-round: 19 -->
<!-- eval-spec: ghana -->
<!-- eval-agent: claude -->

## Why

A second country validates that country defaults are configuration rather than hard-coded assumptions.

## Scope

Country support for Ghana behind a feature flag with GHS currency, +233 numbers and Accra timezone.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `country` column to the `Tenant` model
- [ ] Add `app/lib/country.ts`: add per-country defaults
- [ ] Add `app/lib/flags.ts`: gate signup with the flag
- [ ] Add `__tests__/ghana.test.ts`: cover a GHS booking
- [ ] Add `__tests__/ghana.test.ts`: cover a GHS payment

## Acceptance Criteria

- [ ] A Ghana tenant receives GHS, +233 and Accra defaults, verified by `pnpm test`
- [ ] `__tests__/ghana.test.ts` completes a booking and payment in GHS
- [ ] The Nigeria suite in `__tests__/` continues to pass
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 19 specification, spec ghana, agent claude.
```

</details>
