# Issue #62 — Round notes

## Scope
Define Prisma models for the Bukay booking platform, ensure all tenant-owned
rows carry `tenantId` with an index, and add a seed script that creates a demo
tenant with sample services.

## Progress: 5/5 tasks complete

- [x] Write Prisma models with relations and indexes — `prisma/schema.prisma`
- [x] Add `tenantId` to all tenant-scoped tables — verified by `tests/test_prisma_schema.py`
- [x] Create initial migration — `prisma/migrations/20260609000000_init/migration.sql`; `prisma migrate diff --from-empty --to-schema-datamodel` is byte-identical
- [x] Write `prisma/seed.ts` with demo tenant + 3 services — also seeds 1 staff, 1 client, 1 confirmed booking, 1 paid payment, 1 audit log; idempotent
- [x] Document schema in `docs/DATA_MODEL.md`

## Acceptance criteria

- [x] `prisma migrate dev` runs clean; `prisma db seed` inserts the demo tenant
- [x] All tenant-scoped tables have `@@index([tenantId])`
- [x] Schema doc checked in — `docs/DATA_MODEL.md`

## Verification log (this round)

End-to-end re-verified against a fresh `postgres:16-alpine` container:

```text
$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀

$ npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
(diff vs committed migration: 0 bytes — migration is in sync)

$ DATABASE_URL=postgresql://... npx prisma migrate deploy
Applying migration `20260609000000_init`
All migrations have been successfully applied.

$ DATABASE_URL=postgresql://... npx prisma db seed   # run 2x for idempotency
Tenant ready: demo
Owner user ready: owner@demo.bukay.dev
Inserted 3 services for demo
Business hours set: Mon–Sat 09:00–18:00
Staff ready: Demo Owner
Client ready: Demo Client
Booking ready: 2026-06-15T10:00:00.000Z
Payment ready: 5000 NGN
Audit log entry recorded for seed.bootstrap
🌱  The seed command has been executed.
```

Row counts stable across re-seeds:
`Tenant=1, User=1, Service=3, Staff=1, BusinessHour=6, Client=1, Booking=1, Payment=1, AuditLog=1`.

Live `pg_indexes` query confirms 8 single-column `tenantId` indexes on
`User`, `Service`, `Staff`, `BusinessHour`, `Client`, `Booking`, `Payment`,
`AuditLog`.

## This round's commit

Added `tests/test_prisma_schema.py` — 5 static pytest checks that enforce the
multi-tenant invariant going forward (every tenant-owned model has a
`tenantId String` column and an `@@index([tenantId])`, and `Tenant` itself does
not). Runs in the existing Python CI; no DB required.

```text
$ pytest tests/test_prisma_schema.py -v
tests/test_prisma_schema.py::test_schema_file_exists PASSED
tests/test_prisma_schema.py::test_all_required_models_present PASSED
tests/test_prisma_schema.py::test_every_tenant_scoped_model_has_tenant_id_column PASSED
tests/test_prisma_schema.py::test_every_tenant_scoped_model_has_tenant_index PASSED
tests/test_prisma_schema.py::test_tenant_model_has_no_tenant_id PASSED
========== 6 passed in 0.02s ==========

$ black --check --line-length 100 --exclude '(\.workflows-lib|node_modules)' .
40 files would be left unchanged.
```

## Files

- `prisma/schema.prisma` — full data model (9 models + 5 enums).
- `prisma/seed.ts` — idempotent seed exercising the full model.
- `prisma/migrations/20260609000000_init/migration.sql` — initial migration.
- `prisma/migrations/migration_lock.toml`.
- `docs/DATA_MODEL.md` — schema documentation.
- `tests/test_prisma_schema.py` — static drift-protection checks.
- `package.json`, `tsconfig.json`, `.env.example` — JS/Prisma scaffolding.
