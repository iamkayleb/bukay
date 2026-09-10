<!-- base-branch: eval/claude -->
<!-- eval-round: 19 -->
<!-- eval-spec: ghana -->
<!-- eval-agent: claude -->

## Why

A second country validates that country defaults are configuration rather than hard-coded assumptions.

## Scope

Country support for Ghana behind a feature flag with GHS currency, +233 numbers and Accra timezone.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `country` column to the `Tenant` model
- [ ] Add `app/lib/country.ts`: add per-country defaults
- [ ] Add `app/lib/flags.ts`: gate signup with the flag
- [ ] Add `__tests__/ghana.test.ts` covering booking and payment in GHS

## Acceptance Criteria

- [ ] A Ghana tenant receives GHS, +233 and Accra defaults, verified by `pnpm test`
- [ ] `__tests__/ghana.test.ts` completes a booking and payment in GHS
- [ ] The Nigeria suite in `__tests__/` continues to pass
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `claude` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/claude`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-19.json, spec `ghana`, agent `claude`.
```

</details>
