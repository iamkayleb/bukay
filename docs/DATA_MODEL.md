# Data Model

This document describes the Prisma data model for Bukay. The canonical source is
[`prisma/schema.prisma`](../prisma/schema.prisma); if this document and the schema disagree,
update the schema first and then align this document.

## Summary

Bukay uses a multi-tenant SQLite data model. `Tenant` is the root record for a business, and
every tenant-owned model stores a required `tenantId String` foreign key back to `Tenant.id`.
Tenant-owned models also declare `@@index([tenantId])` so tenant-filtered reads can use a direct
index.

The tenant-owned models are:

| Model | Purpose | Tenant-specific constraints and indexes |
|-------|---------|-----------------------------------------|
| `User` | Login or staff identity for a tenant | `@@unique([tenantId, email])`, `@@index([tenantId])` |
| `Service` | Bookable service with duration and price | `@@unique([tenantId, name])`, `@@index([tenantId])` |
| `Staff` | Staff member who can be assigned to bookings | `@@unique([tenantId, email])`, `@@index([tenantId])` |
| `BusinessHour` | Weekly opening hours by day of week | `@@unique([tenantId, dayOfWeek])`, `@@index([tenantId])` |
| `Client` | Customer profile scoped to a tenant | `@@unique([tenantId, phone])`, `@@index([tenantId])` |
| `Booking` | Appointment linking client, service, and optional staff | `@@index([tenantId])`, `@@index([tenantId, startsAt])` |
| `Payment` | Payment ledger row for a booking | `@@index([tenantId])`, `@@index([bookingId])`, `@@index([providerRef])` |
| `AuditLog` | Append-only tenant activity record | `@@index([tenantId])`, `@@index([tenantId, entityType, entityId])` |

`Tenant` itself is not tenant-scoped and must not carry a `tenantId` column. Deleting a tenant
cascades to its owned rows through the Prisma relations. `Booking` restricts deletion of referenced
clients and services, and sets `staffId` to null when a referenced staff row is deleted.

## Model Details

### Tenant

`Tenant` stores the business name, globally unique slug, timezone, currency, and relations to all
tenant-owned records. The defaults are `Africa/Lagos` for timezone and `NGN` for currency.

### User

`User` stores email, display name, and role. Roles are currently stored as strings with a default of
`owner`.

### Service

`Service` stores name, optional description, duration in minutes, price in minor units, currency, and
an `active` flag.

Archiving is implemented as a soft-delete: `DELETE /api/services/:id` flips `active` to `false`
rather than removing the row, so historical bookings continue to resolve. Booking surfaces
(client-facing booking form, staff calendar picker, any future public schedule) **must** pass
`?active=true` to `GET /api/services` so archived rows are hidden. To keep the contract from
drifting, booking surfaces should call `fetchBookableServices()` in
[`app/lib/services/bookable.ts`](../app/lib/services/bookable.ts), which hardcodes the filter and
strips any archived rows a misconfigured backend might still return. The admin services manager
intentionally fetches without the filter so operators can see and restore archived entries.

### Staff

`Staff` stores contact information and an `active` flag. Bookings may reference staff, but the
booking remains if staff is later deleted.

### BusinessHour

`BusinessHour` stores one row per tenant and weekday, with `opensAt` and `closesAt` as `HH:MM`
strings and an `isClosed` flag.

### Client

`Client` stores customer name, optional email, required phone number, optional notes, and booking
relations.

### Booking

`Booking` links a client, service, optional staff member, start and end timestamps, status string, and
optional notes. The tenant/start index supports calendar views.

### Payment

`Payment` links to a booking and stores amount, currency, provider metadata, status string, optional
paid timestamp, and audit timestamps.

### AuditLog

`AuditLog` stores action history with optional actor and entity references. `metadata` is stored as a
string so callers can serialize structured context when needed.

## Running Migrations

The schema uses SQLite with `url = "file:./dev.db"`, so local migrations create
`prisma/dev.db`.

```bash
# Install dependencies and generate the Prisma client.
npm install
npm run prisma:generate

# Apply migrations to the local SQLite database.
npm run migrate:dev -- --schema prisma/schema.prisma

# Seed the demo tenant and sample data.
npm run db:seed -- --schema prisma/schema.prisma
```

The seed script is configured in `package.json` as `tsx prisma/seed.ts`. It is idempotent: it upserts
the demo tenant with slug `demo`, removes dependent demo rows in foreign-key order, and recreates a
stable sample dataset with an owner user, services, business hours, staff, client, booking, payment,
and audit log.

## Migration History

Migrations live under [`prisma/migrations`](../prisma/migrations). The current history contains one
checked-in migration:

| Migration | Description |
|-----------|-------------|
| `20260611112538_init` | Creates the initial SQLite schema for tenants, users, services, staff, business hours, clients, bookings, payments, and audit logs. It also creates all unique constraints and tenant indexes declared in `schema.prisma`. |

[`prisma/migrations/migration_lock.toml`](../prisma/migrations/migration_lock.toml) records the
database provider as `sqlite`. Do not edit generated migration files by hand after they have been
applied; create a new migration from schema changes instead.

### Schema/Migration Consistency

An earlier iteration of the schema included a `StaffService` join model and a
`staffAssignments StaffService[]` relation on `Service`; both were removed before the initial
migration was authored, so **neither the schema nor any migration references `StaffService`**.
This invariant is enforced by tests so a reintroduction cannot slip in silently:

- `tests/test_prisma_schema.py::test_no_model_relation_references_missing_model` fails if any model
  declares a relation to a type that isn't a declared model.
- `tests/test_prisma_schema.py::test_removed_staff_service_model_stays_removed` fails if the
  `StaffService` model or a `staffAssignments` field reappears in the schema.
- `tests/test_prisma_migration.py::test_migration_tables_are_declared_in_schema` fails if a
  migration ever creates a table that the schema does not declare a model for.
- `tests/test_prisma_migration.py::test_no_migration_creates_staff_service_table` fails if any
  migration creates a `StaffService` table or references `staffAssignments`.

If `StaffService` ever needs to come back, reintroduce the model in `schema.prisma`, add a
migration that creates the table plus its foreign keys, and update these guard tests together.
