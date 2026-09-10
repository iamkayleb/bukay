<!-- base-branch: eval/claude -->
<!-- eval-round: 5 -->
<!-- eval-spec: clients-crm -->
<!-- eval-agent: claude -->

## Why

Repeat business is the core value for these merchants, which requires client history in one place.

## Scope

Client list with search by name or phone, and a profile showing history, lifetime value, no-shows, tags and notes.

## Tasks

- [ ] Add `app/(app)/clients/page.tsx`: build the searchable list
- [ ] Add `app/(app)/clients/[id]/page.tsx`: build the profile
- [ ] Add `lib/client-stats.ts`: compute lifetime value
- [ ] Add `prisma/schema.prisma`: add a `Tag` model and a tag picker
- [ ] Add `prisma/schema.prisma`: an owner-only `notes` column on the `Client` model

## Acceptance Criteria

- [ ] Search over 10k seeded clients returns within 300ms, verified by `pnpm test`
- [ ] The profile lists every past booking for that client
- [ ] Tags persist and filter the list
- [ ] `pnpm test` passes
