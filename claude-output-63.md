# Issue #62 — Round notes

## Scope
Define Prisma models for the Bukay booking platform, ensure all tenant-owned
rows carry `tenantId` with an index, and add a seed script that creates a demo
tenant with sample services.

## Progress: 5/5 tasks complete

- [x] Write Prisma models with relations and indexes — see `prisma/schema.prisma`
- [x] Add tenantId to all tenant-scoped tables — all 8 child tables carry `@@index([tenantId])`
- [x] Create initial migration — `prisma/migrations/20260609000000_init/migration.sql`; `prisma migrate diff --from-empty --to-schema-datamodel` against the current schema produces a byte-identical file
- [x] Write `prisma/seed.ts` with demo tenant + 3 services — now also seeds 1 staff, 1 client, 1 confirmed booking, 1 paid payment, 1 audit log entry; idempotent across re-runs
- [x] Document schema in `docs/DATA_MODEL.md`

## Acceptance criteria

- [x] `prisma migrate dev` runs clean; `prisma db seed` inserts the demo tenant
  - Verified against an ephemeral `postgres:16-alpine` container: `prisma migrate deploy` applied the init migration cleanly, then `prisma db seed` ran twice in a row without error and ended with stable row counts.
- [x] All tenant-scoped tables have `@@index([tenantId])`
  - Verified in live Postgres: `pg_indexes` returns 8 single-column `tenantId` indexes covering `User`, `Service`, `Staff`, `BusinessHour`, `Client`, `Booking`, `Payment`, `AuditLog`.
- [x] Schema doc checked in — `docs/DATA_MODEL.md`.

## Verification log

```text
$ DATABASE_URL=postgresql://... npx prisma migrate deploy
Applying migration `20260609000000_init`
All migrations have been successfully applied.

$ DATABASE_URL=postgresql://... npx prisma db seed   # run twice
Tenant ready: demo
Owner user ready: owner@demo.bukay.dev
Inserted 3 services for demo
Business hours set: Mon–Sat 09:00–18:00
Staff ready: Demo Owner
Client ready: Demo Client
Booking ready: 2026-06-15T10:00:00.000Z
Payment ready: 5000 NGN
Audit log entry recorded for seed.bootstrap
```

Row counts after seeding: `Tenant=1, User=1, Service=3, Staff=1,
BusinessHour=6, Client=1, Booking=1, Payment=1, AuditLog=1`.

## Files

- `prisma/schema.prisma` — full data model (9 models + 5 enums).
- `prisma/seed.ts` — idempotent seed exercising the full model.
- `prisma/migrations/20260609000000_init/migration.sql` — initial migration.
- `prisma/migrations/migration_lock.toml`.
- `docs/DATA_MODEL.md` — schema documentation.
- `package.json`, `tsconfig.json`, `.env.example` — JS/Prisma scaffolding.
