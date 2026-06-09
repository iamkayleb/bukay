# Issue #62 — Round notes

## Scope
Define Prisma models for the Bukay booking platform, ensure all tenant-owned
rows carry `tenantId` with an index, and add a seed script that creates a demo
tenant with sample services.

## Progress: 5/5 tasks complete

- [x] Write Prisma models with relations and indexes — see `prisma/schema.prisma`
- [x] Add tenantId to all tenant-scoped tables — all 8 child tables carry `@@index([tenantId])`
- [x] Create initial migration — `prisma/migrations/20260609000000_init/migration.sql`, applied cleanly against PostgreSQL 16
- [x] Write `prisma/seed.ts` with demo tenant + 3 services — idempotent via upsert
- [x] Document schema in `docs/DATA_MODEL.md`

## Acceptance criteria

- [x] `prisma migrate dev` runs clean; `prisma db seed` inserts the demo tenant
  - Verified locally: dropped DB → `prisma migrate dev` → `prisma db seed` inserted `Tenant(slug='demo')`, 3 services, 1 owner user, 6 weekday business hours.
- [x] All tenant-scoped tables have `@@index([tenantId])`
  - Confirmed via `pg_indexes` query — 8 tenant-scoped tables, 8 matching indexes.
- [x] Schema doc checked in — `docs/DATA_MODEL.md`.

## Files

- `prisma/schema.prisma` — full data model (9 models + 5 enums).
- `prisma/seed.ts` — idempotent seed.
- `prisma/migrations/20260609000000_init/migration.sql` — initial migration.
- `prisma/migrations/migration_lock.toml`.
- `docs/DATA_MODEL.md` — schema documentation.
- `package.json`, `tsconfig.json`, `.env.example` — JS/Prisma scaffolding.
- `.gitignore` — ignore `node_modules`, `dist`, generated client.

## Verification commands

```bash
DATABASE_URL=postgresql://... npx prisma migrate deploy
DATABASE_URL=postgresql://... npx prisma db seed
psql ... -c 'SELECT slug FROM "Tenant";'         # → demo
psql ... -c 'SELECT count(*) FROM "Service";'    # → 3
```
