<!-- base-branch: eval/cursor -->
<!-- eval-round: 1 -->
<!-- eval-spec: schema-v1 -->
<!-- eval-agent: cursor -->

## Why

Every later feature reads or writes these tables, so the model must land before feature work.

## Scope

Define Prisma models for Tenant, User, Service, Staff, BusinessHour, Client, Booking, Payment and AuditLog. All tenant-owned rows carry `tenantId` with an index.

## Tasks

- [ ] Add `prisma/schema.prisma`: define the nine models with relations
- [ ] Add `@@index([tenantId])` to every tenant-scoped model
- [ ] Add `prisma/migrations/`: generate the initial migration
- [ ] Write `prisma/seed.ts` creating one demo tenant and 3 services
- [ ] Add `docs/DATA_MODEL.md`: document the model

## Acceptance Criteria

- [ ] `pnpm prisma migrate dev` applies without error
- [ ] `pnpm prisma db seed` inserts the demo tenant, verified by query
- [ ] Every tenant-scoped model in `prisma/schema.prisma` declares `@@index([tenantId])`
- [ ] `pnpm test` passes
