<!-- base-branch: eval/cursor -->
<!-- eval-round: 1 -->
<!-- eval-spec: schema-v1 -->
<!-- eval-agent: cursor -->

## Why

Every later feature reads or writes these tables, so the model must land before feature work.

## Scope

SEED THIS ONLY AFTER THE `scaffold` PR HAS MERGED INTO THIS LANE. It needs package.json, the pnpm scripts and the Prisma dependency that scaffold creates, and both specs write prisma/schema.prisma.

Define Prisma models for Tenant, User, Service, Staff, BusinessHour, Client, Booking, Payment and AuditLog. All tenant-owned rows carry `tenantId` with an index.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

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

## Implementation Notes

Seeded for the `cursor` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/cursor`. Keep changes limited to the files named in Tasks.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-01.json, spec `schema-v1`, agent `cursor`.
```

</details>
