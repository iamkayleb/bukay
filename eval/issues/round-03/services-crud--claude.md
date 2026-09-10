<!-- base-branch: eval/claude -->
<!-- eval-round: 3 -->
<!-- eval-spec: services-crud -->
<!-- eval-agent: claude -->

## Why

Services are the unit customers book, so they must exist before availability or booking work.

## Scope

Owner can create, edit, archive and delete services with fields name, durationMinutes, priceKobo, bufferMinutes and active.

## Tasks

- [ ] Add `lib/schemas/service.ts`: define Zod schemas
- [ ] Add `app/api/services/route.ts`: implement tenant-scoped handlers
- [ ] Add `app/(app)/services/page.tsx`: build the list and form UI
- [ ] Add `prisma/schema.prisma`: implement soft delete via the `active` column
- [ ] Add `tests/services.test.ts` covering create, read, update and archive

## Acceptance Criteria

- [ ] Every CRUD path is verified by `pnpm test`
- [ ] Prices persist as integer kobo in the `Service` table
- [ ] An invalid payload returns HTTP 400 with inline field errors
- [ ] Archived services are absent from booking surfaces
