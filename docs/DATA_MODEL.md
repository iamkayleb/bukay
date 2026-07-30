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
| `StaffService` | Explicit join between `Staff` and `Service`, scoped to a tenant | `@@unique([staffId, serviceId])`, `@@index([tenantId])`, `@@index([staffId])`, `@@index([serviceId])` |
| `BusinessHour` | Weekly opening hours by day of week | `@@unique([tenantId, dayOfWeek])`, `@@index([tenantId])` |
| `Blackout` | Date-specific override that closes the tenant for one day | `@@unique([tenantId, date])`, `@@index([tenantId])` |
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

### Staff

`Staff` stores contact information and an `active` flag. Bookings may reference staff, but the
booking remains if staff is later deleted.

### StaffService

`StaffService` is an explicit join table between `Staff` and `Service` that carries `tenantId` so the
row is queryable within a tenant boundary. Prisma's implicit many-to-many join tables cannot hold a
`tenantId` column, which would break the multi-tenant scoping invariant.

### BusinessHour

`BusinessHour` stores one row per tenant and weekday, with `opensAt` and `closesAt` as `HH:MM`
strings and an `isClosed` flag.

### Blackout

`Blackout` stores date-specific overrides that suppress the weekly `BusinessHour` schedule for one
day (holidays, one-off closures). `date` is stored as an ISO `YYYY-MM-DD` wall-clock string in the
tenant's timezone so the row is independent of DST or UTC offset transitions.

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

Migrations live under [`prisma/migrations`](../prisma/migrations). The current history contains:

| Migration | Description |
|-----------|-------------|
| `20260611112538_init` | Creates the initial SQLite schema for tenants, users, services, staff, business hours, clients, bookings, payments, and audit logs. It also creates all unique constraints and tenant indexes declared in `schema.prisma`. |
| `20260729000000_staff_service_and_blackout` | Adds the `StaffService` join table and the `Blackout` table along with their tenant indexes and unique constraints. |

[`prisma/migrations/migration_lock.toml`](../prisma/migrations/migration_lock.toml) records the
database provider as `sqlite`. Do not edit generated migration files by hand after they have been
applied; create a new migration from schema changes instead.
