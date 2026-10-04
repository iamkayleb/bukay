<!-- base-branch: eval/claude -->
<!-- eval-round: 19 -->
<!-- eval-spec: ghana -->
<!-- eval-agent: claude -->

## Why

A second country validates that country defaults are configuration rather than hard-coded assumptions.

## Scope

Country support for Ghana behind a feature flag with GHS currency, +233 numbers and Accra timezone.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `country` column to the `Tenant` model
- [ ] Add `lib/country.ts`: add per-country defaults
- [ ] Add `lib/flags.ts`: gate signup with the flag
- [ ] Add `tests/ghana.test.ts` covering booking and payment in GHS

## Acceptance Criteria

- [ ] A Ghana tenant receives GHS, +233 and Accra defaults, verified by `pnpm test`
- [ ] `tests/ghana.test.ts` completes a booking and payment in GHS
- [ ] The Nigeria suite in `tests/` continues to pass
- [ ] `pnpm test` passes
